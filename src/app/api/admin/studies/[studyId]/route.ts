/**
 * Admin Study Detail API
 *
 * GET /api/admin/studies/[studyId]
 *
 * Returns detailed information about a specific study.
 * TODO: Add authentication check when Keycloak is integrated
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;

    const study = await prisma.study.findUnique({
      where: { id: studyId },
      include: {
        categories: {
          orderBy: { displayOrder: 'asc' },
        },
        accessCodes: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            code: true,
            label: true,
            usedAt: true,
            isActive: true,
            createdAt: true,
          },
        },
        sessions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            isCompleted: true,
            isFlagged: true,
            flagReason: true,
            avgResponseTimeMs: true,
            isTestSession: true,
            _count: {
              select: { comparisons: true },
            },
          },
        },
      },
    });

    if (!study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 });
    }

    // Get rankings per category
    const rankings = await Promise.all(
      study.categories.map(async (category) => {
        const items = await prisma.item.findMany({
          where: {
            studyId,
            categoryId: category.id,
          },
          orderBy: [{ eloRating: 'desc' }, { artistRank: 'asc' }],
          select: {
            id: true,
            externalId: true,
            imageUrl: true,
            eloRating: true,
            artistRank: true,
            artistEloBoost: true,
            winCount: true,
            lossCount: true,
            comparisonCount: true,
            leftCount: true,
            rightCount: true,
          },
        });

        return {
          category: {
            id: category.id,
            name: category.name,
            slug: category.slug,
          },
          items: items.map((item, index) => ({
            ...item,
            rank: index + 1,
            winRate:
              item.comparisonCount > 0
                ? Math.round((item.winCount / item.comparisonCount) * 100)
                : 0,
            positionBias:
              item.leftCount + item.rightCount > 0
                ? Math.round((item.leftCount / (item.leftCount + item.rightCount)) * 100)
                : 50,
          })),
        };
      })
    );

    // Get comparison history (excluding test sessions)
    const recentComparisons = await prisma.comparison.findMany({
      where: {
        studyId,
        OR: [
          { flagReason: null },
          { flagReason: { not: 'test_session' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        responseTimeMs: true,
        isFlagged: true,
        flagReason: true,
        category: {
          select: { name: true },
        },
      },
    });

    // Calculate statistics (excluding test sessions)
    const totalComparisons = await prisma.comparison.count({
      where: {
        studyId,
        OR: [
          { flagReason: null },
          { flagReason: { not: 'test_session' } },
        ],
      },
    });
    const flaggedCount = await prisma.comparison.count({
      where: {
        studyId,
        isFlagged: true,
        NOT: { flagReason: 'test_session' },
      },
    });

    const avgResponseTime = await prisma.comparison.aggregate({
      where: {
        studyId,
        responseTimeMs: { not: null },
        OR: [
          { flagReason: null },
          { flagReason: { not: 'test_session' } },
        ],
      },
      _avg: { responseTimeMs: true },
    });

    // Get flag reason breakdown (excluding test_session)
    const flagBreakdown = await prisma.comparison.groupBy({
      by: ['flagReason'],
      where: {
        studyId,
        isFlagged: true,
        NOT: { flagReason: 'test_session' },
      },
      _count: true,
    });

    // Filter out test sessions from the sessions list
    const realSessions = study.sessions.filter((s) => !s.isTestSession);

    return NextResponse.json({
      study: {
        id: study.id,
        title: study.title,
        description: study.description,
        isActive: study.isActive,
        language: study.language,
        createdAt: study.createdAt,
        requireAccessCode: study.requireAccessCode,
        hasCategorySeparation: study.hasCategorySeparation,
      },
      accessCodes: study.accessCodes,
      sessions: realSessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        isCompleted: s.isCompleted,
        isFlagged: s.isFlagged,
        flagReason: s.flagReason,
        comparisonCount: s._count.comparisons,
        avgResponseTimeMs: s.avgResponseTimeMs,
      })),
      rankings,
      stats: {
        totalComparisons,
        flaggedCount,
        flaggedPercentage:
          totalComparisons > 0 ? Math.round((flaggedCount / totalComparisons) * 100) : 0,
        avgResponseTimeMs: Math.round(avgResponseTime._avg.responseTimeMs || 0),
        flagBreakdown: flagBreakdown.map((f) => ({
          reason: f.flagReason,
          count: f._count,
        })),
      },
      recentComparisons,
    });
  } catch (error) {
    console.error('Study detail API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
