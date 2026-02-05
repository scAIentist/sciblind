/**
 * Next.js Middleware
 *
 * - Adds security headers to all responses
 * - Protects admin routes with authentication
 *
 * Admin auth uses ADMIN_SECRET env var (interim until Keycloak).
 * When Keycloak is integrated, this will validate JWT from auth.scaientist.eu.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function isAdminAuthenticated(request: NextRequest): boolean {
  if (!ADMIN_SECRET) return false;

  // Check Authorization header: Bearer <secret>
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token === ADMIN_SECRET) return true;
  }

  // Check cookie: sciblind-admin-token
  const cookieToken = request.cookies.get('sciblind-admin-token')?.value;
  if (cookieToken === ADMIN_SECRET) return true;

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ===== Admin Route Protection =====

  // Protect all /api/admin/* routes EXCEPT /api/admin/auth (login endpoint)
  if (pathname.startsWith('/api/admin') && !pathname.startsWith('/api/admin/auth')) {
    if (!isAdminAuthenticated(request)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin authentication required.', errorKey: 'ADMIN_AUTH_REQUIRED' },
        { status: 401 }
      );
    }
  }

  // Protect admin pages — redirect to admin login page
  // Exception: /admin/login itself must be accessible
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    if (!isAdminAuthenticated(request)) {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ===== Security Headers =====
  const response = NextResponse.next();
  const headers = response.headers;

  // Prevent clickjacking
  headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');

  // XSS protection (legacy, but still useful for older browsers)
  headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy (restrict browser features)
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Content Security Policy for API routes
  if (pathname.startsWith('/api/')) {
    headers.set(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'"
    );
  }

  // HSTS (only in production)
  if (process.env.NODE_ENV === 'production') {
    headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
