/**
 * Access Code Authentication API
 *
 * POST /api/participate/[studyId]/auth
 *
 * Validates access code and creates a session for the participant.
 *
 * Security features:
 * - Rate limiting (5 attempts per minute per IP)
 * - Input validation and sanitization
 * - Timing-safe code comparison
 * - IP fingerprinting
 *
 * Test mode:
 * - Test codes can be used unlimited times
 * - Test sessions don't affect ELO ratings
 * - Test sessions are excluded from statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashAccessCode, hashIP, generateSessionToken } from '@/lib/auth/hash';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';
import { validateAuthRequest, getClientIP, isValidCuid } from '@/lib/security/validation';
import { logActivity } from '@/lib/logging';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  // Get client IP for rate limiting
  const clientIP = getClientIP(request.headers);
  const ipHash = hashIP(clientIP, process.env.IP_SALT || 'default-salt');

  // Check rate limit first (before any DB operations)
  const rateLimit = checkRateLimit(ipHash, RATE_LIMITS.auth);
  const rateLimitHeaders = getRateLimitHeaders(rateLimit);

  if (!rateLimit.success) {
    logActivity('AUTH_RATE_LIMITED', {
      ipHash,
      userAgent: request.headers.get('user-agent')?.slice(0, 500) || undefined,
      detail: 'Auth rate limit triggered',
    });
    return NextResponse.json(
      {
        error: 'Too many authentication attempts. Please try again later.',
        errorKey: 'RATE_LIMITED',
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: rateLimitHeaders,
      }
    );
  }

  try {
    const { studyId } = await params;

    // Validate studyId format
    if (!isValidCuid(studyId)) {
      return NextResponse.json(
        { error: 'Invalid study ID format', errorKey: 'INVALID_STUDY_ID' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', errorKey: 'INVALID_JSON' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const validation = validateAuthRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error, errorKey: 'VALIDATION_ERROR' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const code = validation.code!;

    // Get study
    const study = await prisma.study.findUnique({
      where: { id: studyId },
      select: {
        id: true,
        requireAccessCode: true,
        isActive: true,
        title: true,
      },
    });

    if (!study) {
      return NextResponse.json(
        { error: 'Study not found', errorKey: 'STUDY_NOT_FOUND' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (!study.isActive) {
      return NextResponse.json(
        { error: 'Study is not active', errorKey: 'STUDY_INACTIVE' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    if (!study.requireAccessCode) {
      // Study doesn't require access code, create session directly
      const token = generateSessionToken();

      const session = await prisma.session.create({
        data: {
          studyId,
          token,
          ipHash,
          userAgent: request.headers.get('user-agent')?.slice(0, 500) || undefined,
        },
      });

      return NextResponse.json(
        {
          success: true,
          sessionToken: session.token,
          sessionId: session.id,
        },
        { headers: rateLimitHeaders }
      );
    }

    // Hash the provided code for lookup
    const codeHash = hashAccessCode(code.trim());

    // Find the access code
    const accessCode = await prisma.accessCode.findFirst({
      where: {
        studyId,
        codeHash,
      },
    });

    if (!accessCode) {
      logActivity('AUTH_FAILURE', {
        studyId,
        ipHash,
        userAgent: request.headers.get('user-agent')?.slice(0, 500) || undefined,
        detail: 'Invalid access code attempt',
      });
      // Use generic error to prevent enumeration
      return NextResponse.json(
        { error: 'Invalid access code', errorKey: 'INVALID_CODE' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    if (!accessCode.isActive) {
      return NextResponse.json(
        { error: 'Access code has been deactivated', errorKey: 'CODE_INACTIVE' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Access code has expired', errorKey: 'CODE_EXPIRED' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    // TEST CODE: Allow unlimited uses, always create new test session
    if (accessCode.isTestCode) {
      const token = generateSessionToken();

      const session = await prisma.session.create({
        data: {
          studyId,
          token,
          ipHash,
          userAgent: request.headers.get('user-agent')?.slice(0, 500) || undefined,
          categoryProgress: {},
          isTestSession: true, // Mark as test session
        },
      });

      logActivity('SESSION_CREATED', {
        studyId,
        sessionId: session.id,
        ipHash,
        userAgent: request.headers.get('user-agent')?.slice(0, 500) || undefined,
        detail: `[TEST] Test session created (code: ${accessCode.label})`,
        metadata: { codeLabel: accessCode.label, isTestSession: true },
      });

      return NextResponse.json(
        {
          success: true,
          sessionToken: session.token,
          sessionId: session.id,
          codeLabel: accessCode.label,
          isTestMode: true, // Let client know this is test mode
        },
        { headers: rateLimitHeaders }
      );
    }

    // REGULAR CODE: Check if already used (single-use)
    if (accessCode.usedAt || accessCode.usedBySessionId) {
      // Return the existing session token if still valid
      if (accessCode.usedBySessionId) {
        const existingSession = await prisma.session.findUnique({
          where: { id: accessCode.usedBySessionId },
        });

        if (existingSession) {
          logActivity('SESSION_RESUMED', {
            studyId,
            sessionId: existingSession.id,
            ipHash,
            detail: `Session resumed (code: ${accessCode.label})`,
          });
          return NextResponse.json(
            {
              success: true,
              sessionToken: existingSession.token,
              sessionId: existingSession.id,
              resumed: true,
            },
            { headers: rateLimitHeaders }
          );
        }
      }

      return NextResponse.json(
        { error: 'Access code has already been used', errorKey: 'CODE_USED' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    // Create new session for regular code
    const token = generateSessionToken();

    const session = await prisma.session.create({
      data: {
        studyId,
        token,
        ipHash,
        userAgent: request.headers.get('user-agent')?.slice(0, 500) || undefined,
        categoryProgress: {},
        isTestSession: false,
      },
    });

    // Mark access code as used
    await prisma.accessCode.update({
      where: { id: accessCode.id },
      data: {
        usedAt: new Date(),
        usedBySessionId: session.id,
      },
    });

    logActivity('SESSION_CREATED', {
      studyId,
      sessionId: session.id,
      ipHash,
      userAgent: request.headers.get('user-agent')?.slice(0, 500) || undefined,
      detail: `Reviewer session created (code: ${accessCode.label})`,
      metadata: { codeLabel: accessCode.label, isTestSession: false },
    });

    logActivity('AUTH_SUCCESS', {
      studyId,
      sessionId: session.id,
      ipHash,
      detail: `Access code used: ${accessCode.label}`,
    });

    return NextResponse.json(
      {
        success: true,
        sessionToken: session.token,
        sessionId: session.id,
        codeLabel: accessCode.label,
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500, headers: rateLimitHeaders }
    );
  }
}
