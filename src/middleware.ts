/**
 * Next.js Middleware
 *
 * Adds security headers to all responses.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Get the response
  const response = NextResponse.next();

  // Security headers
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
  if (request.nextUrl.pathname.startsWith('/api/')) {
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
