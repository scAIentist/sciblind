/**
 * Admin Dashboard API
 *
 * GET /api/admin/dashboard
 *
 * Returns comprehensive statistics for the admin dashboard.
 * TODO: Add authentication check when Keycloak is integrated
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    // Get all studies with related data
    const studies = await prisma.study.findMany({
      include: {
        categories: {
          include: {
            items: true,
          },
        },
        sessions: {
          include: {
            comparisons: true,
          },
        },
        accessCodes: true,
        _count: {
          select: {
            comparisons: true,
            sessions: true,
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate global stats
    const totalStudies = studies.length;
    const activeStudies = studies.filter((s) => s.isActive).length;
    const totalComparisons = studies.reduce((acc, s) => acc + s._count.comparisons, 0);
    const totalSessions = studies.reduce((acc, s) => acc + s._count.sessions, 0);
    const completedSessions = studies.reduce(
      (acc, s) => acc + s.sessions.filter((sess) => sess.isCompleted).length,
      0
    );

    // Calculate flagged comparisons
    const flaggedComparisons = await prisma.comparison.count({
      where: { isFlagged: true },
    });

    // Process each study for detailed stats
    const studyStats = await Promise.all(
      studies.map(async (study) => {
        // Calculate category progress
        const categoryStats = await Promise.all(
          study.categories.map(async (category) => {
            const itemCount = category.items.length;
            const comparisonsInCategory = await prisma.comparison.count({
              where: {
                studyId: study.id,
                categoryId: category.id,
              },
            });

            // Get top items by ELO in this category
            const topItems = await prisma.item.findMany({
              where: {
                studyId: study.id,
                categoryId: category.id,
              },
              orderBy: [{ eloRating: 'desc' }, { artistRank: 'asc' }],
              take: 5,
              select: {
                id: true,
                externalId: true,
                eloRating: true,
                artistRank: true,
                winCount: true,
                lossCount: true,
                comparisonCount: true,
              },
            });

            return {
              id: category.id,
              name: category.name,
              slug: category.slug,
              itemCount,
              comparisonsInCategory,
              topItems,
            };
          })
        );

        // Access code usage
        const accessCodeStats = {
          total: study.accessCodes.length,
          used: study.accessCodes.filter((c) => c.usedAt).length,
          available: study.accessCodes.filter((c) => !c.usedAt && c.isActive).length,
        };

        // Session stats
        const sessionStats = {
          total: study.sessions.length,
          completed: study.sessions.filter((s) => s.isCompleted).length,
          inProgress: study.sessions.filter((s) => !s.isCompleted).length,
          flagged: study.sessions.filter((s) => s.isFlagged).length,
        };

        // Average response time
        const avgResponseTime =
          study.sessions.length > 0
            ? Math.round(
                study.sessions.reduce((acc, s) => acc + (s.avgResponseTimeMs || 0), 0) /
                  study.sessions.filter((s) => s.avgResponseTimeMs).length || 0
              )
            : 0;

        // Comparisons over time (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentComparisons = await prisma.comparison.groupBy({
          by: ['createdAt'],
          where: {
            studyId: study.id,
            createdAt: {
              gte: sevenDaysAgo,
            },
          },
          _count: true,
        });

        return {
          id: study.id,
          title: study.title,
          isActive: study.isActive,
          createdAt: study.createdAt,
          language: study.language,
          totalItems: study._count.items,
          totalComparisons: study._count.comparisons,
          totalSessions: study._count.sessions,
          categoryStats,
          accessCodeStats,
          sessionStats,
          avgResponseTime,
          recentActivity: recentComparisons.length,
        };
      })
    );

    return NextResponse.json({
      globalStats: {
        totalStudies,
        activeStudies,
        totalComparisons,
        totalSessions,
        completedSessions,
        flaggedComparisons,
      },
      studies: studyStats,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
