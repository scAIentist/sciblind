/**
 * Admin Authentication
 *
 * Temporary admin auth using a shared secret until Keycloak is integrated.
 * The admin secret is stored in the ADMIN_SECRET environment variable.
 *
 * Usage in API routes:
 *   const authError = requireAdminAuth(request);
 *   if (authError) return authError;
 *
 * The secret can be sent via:
 * - Authorization header: `Bearer <secret>`
 * - Cookie: `sciblind-admin-token=<secret>`
 *
 * When Keycloak is integrated, this module will be replaced with JWT validation
 * from auth.scaientist.eu. The function signature will remain the same.
 */

import { NextRequest, NextResponse } from 'next/server';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * Check if the request has valid admin authentication.
 * Returns null if authenticated, or a 401 NextResponse if not.
 */
export function requireAdminAuth(request: NextRequest): NextResponse | null {
  if (!ADMIN_SECRET) {
    console.error('[AdminAuth] ADMIN_SECRET environment variable is not set!');
    return NextResponse.json(
      { error: 'Server configuration error: admin auth not configured' },
      { status: 500 }
    );
  }

  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token === ADMIN_SECRET) {
      return null; // authenticated
    }
  }

  // Check cookie
  const cookieToken = request.cookies.get('sciblind-admin-token')?.value;
  if (cookieToken === ADMIN_SECRET) {
    return null; // authenticated
  }

  return NextResponse.json(
    { error: 'Unauthorized. Admin authentication required.', errorKey: 'ADMIN_AUTH_REQUIRED' },
    { status: 401 }
  );
}

/**
 * Validate admin credentials and return a session cookie.
 * Used by the admin login endpoint.
 */
export function validateAdminLogin(secret: string): boolean {
  if (!ADMIN_SECRET) return false;
  return secret === ADMIN_SECRET;
}
