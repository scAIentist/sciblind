/**
 * Audit Export API
 *
 * GET /api/admin/studies/[studyId]/export
 *
 * Returns all comparisons (non-test) as a comprehensive JSON export
 * suitable for external analysis and reproducibility.
 *
 * Query parameters:
 * - categoryId: Filter by category
 * - includeTest: Include test comparisons (default: false)
 * - format: "json" (default) — CSV can be generated client-side
 *
 * The export includes:
 * - Study configuration (algo version, K-factor, thresholds)
 * - Item metadata (externalId, label, category, initial ELO, artist rank)
 * - All comparison records with full audit trail
 * - Summary statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/logging';

const ALGO_VERSION = 'sciblind-v2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const includeTest = searchParams.get('includeTest') === 'true';

    // Get study
    const study = await prisma.study.findUnique({
      where: { id: studyId },
      include: {
        categories: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!study) {
      return NextResponse.json(
        { error: 'Study not found', errorKey: 'STUDY_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Get all items
    const items = await prisma.item.findMany({
      where: {
        studyId,
        ...(categoryId ? { categoryId } : {}),
      },
      include: {
        category: true,
      },
      orderBy: [
        { categoryId: 'asc' },
        { externalId: 'asc' },
      ],
    });

    // Get comparisons
    const comparisons = await prisma.comparison.findMany({
      where: {
        studyId,
        ...(categoryId ? { categoryId } : {}),
        ...(includeTest ? {} : {
          OR: [
            { isFlagged: false },
            { flagReason: { not: 'test_session' } },
          ],
        }),
      },
      include: {
        session: {
          select: {
            id: true,
            isTestSession: true,
            ipHash: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get sessions summary
    const sessions = await prisma.session.findMany({
      where: { studyId },
      select: {
        id: true,
        createdAt: true,
        isTestSession: true,
        isCompleted: true,
        comparisonCount: true,
        avgResponseTimeMs: true,
        isFlagged: true,
        flagReason: true,
      },
    });

    // Format export
    const exportData = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      algoVersion: ALGO_VERSION,

      study: {
        id: study.id,
        title: study.title,
        description: study.description,
        inputType: study.inputType,
        rankingMethod: study.rankingMethod,
        eloKFactor: study.eloKFactor,
        eloInitialRating: study.eloInitialRating,
        minExposuresPerItem: study.minExposuresPerItem,
        minTotalComparisons: study.minTotalComparisons,
        adaptiveKFactor: study.adaptiveKFactor,
        hasCategorySeparation: study.hasCategorySeparation,
        language: study.language,
        createdAt: study.createdAt.toISOString(),
      },

      categories: study.categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        displayOrder: c.displayOrder,
      })),

      items: items.map((item) => ({
        id: item.id,
        externalId: item.externalId,
        label: item.label,
        categoryId: item.categoryId,
        categoryName: item.category?.name,
        artistRank: item.artistRank,
        artistEloBoost: item.artistEloBoost,
        eloRating: item.eloRating,
        eloGames: item.eloGames,
        comparisonCount: item.comparisonCount,
        winCount: item.winCount,
        lossCount: item.lossCount,
        leftCount: item.leftCount,
        rightCount: item.rightCount,
      })),

      comparisons: comparisons.map((c) => ({
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        sessionId: c.sessionId,
        categoryId: c.categoryId,
        itemAId: c.itemAId,
        itemBId: c.itemBId,
        winnerId: c.winnerId,
        leftItemId: c.leftItemId,
        rightItemId: c.rightItemId,
        responseTimeMs: c.responseTimeMs,
        isFlagged: c.isFlagged,
        flagReason: c.flagReason,
        algoVersion: c.algoVersion,
        isTestSession: c.session.isTestSession,
      })),

      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        isTestSession: s.isTestSession,
        isCompleted: s.isCompleted,
        comparisonCount: s.comparisonCount,
        avgResponseTimeMs: s.avgResponseTimeMs,
        isFlagged: s.isFlagged,
        flagReason: s.flagReason,
      })),

      summary: {
        totalItems: items.length,
        totalComparisons: comparisons.length,
        totalSessions: sessions.length,
        completedSessions: sessions.filter((s) => s.isCompleted).length,
        testSessions: sessions.filter((s) => s.isTestSession).length,
        flaggedComparisons: comparisons.filter((c) => c.isFlagged).length,
        categoriesCount: study.categories.length,
        selectedCategoryFilter: categoryId,
        includesTestData: includeTest,
      },
    };

    logActivity('EXPORT_DOWNLOADED', {
      studyId,
      detail: `Export downloaded (${comparisons.length} comparisons, ${sessions.length} sessions)`,
      metadata: { categoryId: categoryId || null, includeTest },
    });

    // Set content-disposition for download
    const filename = `sciblind-export-${study.id}-${new Date().toISOString().split('T')[0]}.json`;

    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
