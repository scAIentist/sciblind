/**
 * Activity Log API
 *
 * GET /api/admin/activity-log
 *
 * Returns the activity log entries for monitoring and auditing.
 *
 * Query parameters:
 * - studyId: Filter by study
 * - sessionId: Filter by session
 * - action: Filter by action type
 * - limit: Max entries (default 100, max 1000)
 * - offset: Pagination offset
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studyId = searchParams.get('studyId');
    const sessionId = searchParams.get('sessionId');
    const action = searchParams.get('action');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    if (studyId) where.studyId = studyId;
    if (sessionId) where.sessionId = sessionId;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Activity log error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
