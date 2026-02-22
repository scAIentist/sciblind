/**
 * Password Reset API
 *
 * POST /api/admin/auth/reset-password
 *   - { email } - Request password reset (sends email with token)
 *   - { token, password } - Complete password reset
 *
 * GET /api/admin/auth/reset-password?token=xxx
 *   - Validate reset token (check if valid and not expired)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';
import { generatePasswordReset, resetPassword } from '@/lib/security/user-auth';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Rate limit to prevent abuse
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = checkRateLimit(clientIp, RATE_LIMITS.auth);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.', errorKey: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const body = await request.json();

    // Request password reset (send email)
    if (body.email && !body.token) {
      const { email } = body;

      if (typeof email !== 'string' || !email.includes('@')) {
        return NextResponse.json(
          { error: 'Valid email is required' },
          { status: 400 }
        );
      }

      const resetToken = await generatePasswordReset(email);

      // Always return success to prevent email enumeration
      // In production, you would send an email here
      if (resetToken) {
        const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://blind.scaientist.eu'}/admin/reset-password?token=${resetToken}`;

        // TODO: Send email with reset link
        // For now, log it (remove in production!)
        console.log(`[Password Reset] Email: ${email}`);
        console.log(`[Password Reset] Token: ${resetToken}`);
        console.log(`[Password Reset] URL: ${resetUrl}`);
      }

      return NextResponse.json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been sent.',
      });
    }

    // Complete password reset
    if (body.token && body.password) {
      const { token, password } = body;

      if (typeof token !== 'string' || typeof password !== 'string') {
        return NextResponse.json(
          { error: 'Token and password are required' },
          { status: 400 }
        );
      }

      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }

      const success = await resetPassword(token, password);

      if (!success) {
        return NextResponse.json(
          { error: 'Invalid or expired reset token', errorKey: 'INVALID_TOKEN' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Password has been reset successfully. You can now log in.',
      });
    }

    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Check if token is valid
    const user = await prisma.user.findUnique({
      where: { resetToken: token },
      select: {
        id: true,
        email: true,
        resetTokenExpiry: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { valid: false, error: 'Invalid reset token' },
        { status: 400 }
      );
    }

    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return NextResponse.json(
        { valid: false, error: 'Reset token has expired' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      email: user.email,
    });
  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
