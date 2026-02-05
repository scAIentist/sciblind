/**
 * Admin Authentication API
 *
 * POST /api/admin/auth
 *
 * Validates admin credentials and sets a session cookie.
 * This is temporary until Keycloak SSO is integrated.
 *
 * When Keycloak is ready, this endpoint will be replaced by
 * the Keycloak/Traefik auth flow at auth.scaientist.eu.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminLogin } from '@/lib/security/admin-auth';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit login attempts by IP to prevent brute force
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = checkRateLimit(clientIp, RATE_LIMITS.auth);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.', errorKey: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const body = await request.json();
    const { secret } = body;

    if (!secret || typeof secret !== 'string') {
      return NextResponse.json(
        { error: 'Secret is required' },
        { status: 400 }
      );
    }

    if (!validateAdminLogin(secret)) {
      return NextResponse.json(
        { error: 'Invalid admin credentials', errorKey: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    // Set HTTP-only cookie for admin session
    const response = NextResponse.json({ success: true });
    response.cookies.set('sciblind-admin-token', secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  // Logout — clear the admin cookie
  const response = NextResponse.json({ success: true });
  response.cookies.set('sciblind-admin-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  return response;
}
