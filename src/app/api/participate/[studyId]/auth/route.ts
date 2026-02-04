/**
 * Access Code Authentication API
 *
 * POST /api/participate/[studyId]/auth
 *
 * Validates access code and creates a session for the participant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashAccessCode, hashIP, generateSessionToken } from '@/lib/auth/hash';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Access code is required', errorKey: 'CODE_REQUIRED' },
        { status: 400 }
      );
    }

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
        { status: 404 }
      );
    }

    if (!study.isActive) {
      return NextResponse.json(
        { error: 'Study is not active', errorKey: 'STUDY_INACTIVE' },
        { status: 403 }
      );
    }

    if (!study.requireAccessCode) {
      // Study doesn't require access code, create session directly
      const token = generateSessionToken();
      const ipHash = hashIP(
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        process.env.IP_SALT || 'default-salt'
      );

      const session = await prisma.session.create({
        data: {
          studyId,
          token,
          ipHash,
          userAgent: request.headers.get('user-agent') || undefined,
        },
      });

      return NextResponse.json({
        success: true,
        sessionToken: session.token,
        sessionId: session.id,
      });
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
      return NextResponse.json(
        { error: 'Invalid access code', errorKey: 'INVALID_CODE' },
        { status: 401 }
      );
    }

    if (!accessCode.isActive) {
      return NextResponse.json(
        { error: 'Access code has been deactivated', errorKey: 'CODE_INACTIVE' },
        { status: 401 }
      );
    }

    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Access code has expired', errorKey: 'CODE_EXPIRED' },
        { status: 401 }
      );
    }

    // Check if code was already used (single-use)
    if (accessCode.usedAt || accessCode.usedBySessionId) {
      // Return the existing session token if still valid
      if (accessCode.usedBySessionId) {
        const existingSession = await prisma.session.findUnique({
          where: { id: accessCode.usedBySessionId },
        });

        if (existingSession) {
          return NextResponse.json({
            success: true,
            sessionToken: existingSession.token,
            sessionId: existingSession.id,
            resumed: true,
          });
        }
      }

      return NextResponse.json(
        { error: 'Access code has already been used', errorKey: 'CODE_USED' },
        { status: 401 }
      );
    }

    // Create new session
    const token = generateSessionToken();
    const ipHash = hashIP(
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      process.env.IP_SALT || 'default-salt'
    );

    const session = await prisma.session.create({
      data: {
        studyId,
        token,
        ipHash,
        userAgent: request.headers.get('user-agent') || undefined,
        categoryProgress: {},
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

    return NextResponse.json({
      success: true,
      sessionToken: session.token,
      sessionId: session.id,
      codeLabel: accessCode.label,
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
