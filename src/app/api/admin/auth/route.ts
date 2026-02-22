/**
 * Admin Authentication API
 *
 * POST /api/admin/auth
 *   - { email, password } - Email/password login (new system)
 *   - { secret } - Legacy shared secret login (backwards compatible)
 *
 * DELETE /api/admin/auth
 *   - Logout - clears session
 *
 * GET /api/admin/auth
 *   - Returns current user info if authenticated
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminLogin } from '@/lib/security/admin-auth';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';
import {
  authenticateUser,
  createAdminSession,
  deleteAdminSession,
  getAuthenticatedUser,
} from '@/lib/security/user-auth';

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

    // New email/password authentication
    if (body.email && body.password) {
      const { email, password } = body;

      if (typeof email !== 'string' || typeof password !== 'string') {
        return NextResponse.json(
          { error: 'Email and password are required' },
          { status: 400 }
        );
      }

      const user = await authenticateUser(email, password);

      if (!user) {
        return NextResponse.json(
          { error: 'Invalid email or password', errorKey: 'INVALID_CREDENTIALS' },
          { status: 401 }
        );
      }

      // Create session and get token
      const sessionToken = await createAdminSession(user.id, request);

      // Set HTTP-only cookie for admin session
      const response = NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });

      response.cookies.set('sciblind-admin-token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });

      return response;
    }

    // Legacy shared secret authentication (backwards compatible)
    if (body.secret) {
      const { secret } = body;

      if (typeof secret !== 'string') {
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

      // Set HTTP-only cookie with the secret (legacy mode)
      const response = NextResponse.json({
        success: true,
        user: {
          id: 'legacy-admin',
          email: 'admin@sciblind.local',
          name: 'Legacy Admin',
          role: 'SUPER_ADMIN',
        },
      });

      response.cookies.set('sciblind-admin-token', secret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });

      return response;
    }

    return NextResponse.json(
      { error: 'Email/password or secret is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Get session token to delete from database
    const sessionToken = request.cookies.get('sciblind-admin-token')?.value;

    if (sessionToken) {
      // Try to delete from database (will do nothing for legacy tokens)
      await deleteAdminSession(sessionToken);
    }

    // Clear the admin cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set('sciblind-admin-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    // Still clear cookie even if DB delete fails
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
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated', errorKey: 'NOT_AUTHENTICATED' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
