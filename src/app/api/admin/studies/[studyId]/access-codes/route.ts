/**
 * Access Codes Management API
 *
 * GET /api/admin/studies/[studyId]/access-codes
 *   Returns all access codes for the study
 *
 * POST /api/admin/studies/[studyId]/access-codes
 *   Creates new access codes
 *   Body: { count: number, prefix?: string, isTestCode?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminAuth } from '@/lib/security/admin-auth';
import { logActivity } from '@/lib/logging';
import * as crypto from 'crypto';

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function randomSuffix(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const { studyId } = await params;

    const accessCodes = await prisma.accessCode.findMany({
      where: { studyId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        code: true,
        label: true,
        isActive: true,
        isTestCode: true,
        usedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      accessCodes,
      summary: {
        total: accessCodes.length,
        available: accessCodes.filter((c) => !c.usedAt && c.isActive).length,
        used: accessCodes.filter((c) => c.usedAt).length,
        testCodes: accessCodes.filter((c) => c.isTestCode).length,
      },
    });
  } catch (error) {
    console.error('Access codes fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const { studyId } = await params;
    const body = await request.json();

    const count = Math.min(Math.max(1, body.count || 1), 20); // 1-20 codes at a time
    const prefix = body.prefix || 'IzVRS-ocenjevalec';
    const isTestCode = Boolean(body.isTestCode);

    // Verify study exists
    const study = await prisma.study.findUnique({
      where: { id: studyId },
      select: { id: true, title: true },
    });

    if (!study) {
      return NextResponse.json(
        { error: 'Study not found' },
        { status: 404 }
      );
    }

    const createdCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = `${prefix}${randomSuffix()}`;

      await prisma.accessCode.create({
        data: {
          studyId,
          code,
          codeHash: hashCode(code),
          label: isTestCode ? 'Test Code' : 'Evaluator',
          isActive: true,
          isTestCode,
        },
      });

      createdCodes.push(code);
    }

    logActivity('ACCESS_CODES_CREATED', {
      studyId,
      detail: `Created ${count} access codes (${isTestCode ? 'test' : 'evaluator'})`,
      metadata: { count, prefix, isTestCode, codes: createdCodes },
    });

    return NextResponse.json({
      success: true,
      created: createdCodes,
      count: createdCodes.length,
    });
  } catch (error) {
    console.error('Access codes creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
