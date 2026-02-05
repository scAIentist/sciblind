/**
 * Rankings API
 *
 * GET /api/studies/[studyId]/rankings
 *
 * Returns current rankings for a study, optionally filtered by category.
 * Includes ELO ratings, win/loss records, confidence indicators,
 * standard errors, data sufficiency status, graph connectivity,
 * and non-transitivity diagnostics.
 *
 * Enhanced in sciblind-v2 with:
 * - ratingStdError per item (Elo SE approximation)
 * - dataStatus per category ("insufficient" | "publishable" | "confirmation")
 * - publishableThreshold with detailed pass/fail conditions
 * - graphConnected + componentCount
 * - circularTriadCount + transitivityIndex
 * - Bradley-Terry abilities (when requested via ?bt=true or study uses BT)
 * - algoVersion in response
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { compareItemsForRanking, getConfidenceLevel } from '@/lib/ranking/elo';
import { calculateEloStdError, isPublishableThreshold, checkGraphConnectivity, detectCircularTriads } from '@/lib/ranking/statistics';
import { estimateBradleyTerry, btAbilityToEloScale } from '@/lib/ranking/bradley-terry';
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
    const topN = parseInt(searchParams.get('topN') || '0', 10);
    const includeBT = searchParams.get('bt') === 'true';

    // Get study with categories
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

    // Build query
    const itemQuery = {
      studyId,
      ...(categoryId ? { categoryId } : {}),
    };

    // Get items
    const items = await prisma.item.findMany({
      where: itemQuery,
      include: {
        category: true,
      },
    });

    // Get all comparisons for this study/category
    const allComparisons = await prisma.comparison.findMany({
      where: {
        studyId,
        ...(categoryId ? { categoryId } : {}),
      },
      select: {
        id: true,
        winnerId: true,
        itemAId: true,
        itemBId: true,
        isFlagged: true,
        flagReason: true,
        categoryId: true,
      },
    });

    // Filter out test comparisons for statistics
    const validComparisons = allComparisons.filter(
      (c) => !c.isFlagged || c.flagReason !== 'test_session',
    );

    // Sort items by ranking criteria
    const sortedItems = items.sort(compareItemsForRanking);

    // Apply topN limit if specified
    const rankedItems = topN > 0 ? sortedItems.slice(0, topN) : sortedItems;

    // Compute Bradley-Terry if requested or if study uses BT method
    let btResults: Map<string, { ability: number; se: number }> | null = null;
    if (includeBT || study.rankingMethod === 'BRADLEY_TERRY') {
      const btComparisons = validComparisons.map((c) => ({
        winnerId: c.winnerId,
        loserId: c.winnerId === c.itemAId ? c.itemBId : c.itemAId,
      }));

      if (btComparisons.length > 0) {
        const btResult = estimateBradleyTerry(btComparisons);
        btResults = new Map();
        for (const item of items) {
          const ability = btResult.abilities.get(item.id) ?? 0;
          const se = btResult.standardErrors.get(item.id) ?? Infinity;
          btResults.set(item.id, { ability, se });
        }
      }
    }

    // Format response
    const rankings = rankedItems.map((item, index) => {
      const stdError = calculateEloStdError(item.comparisonCount);
      const btData = btResults?.get(item.id);

      return {
        rank: index + 1,
        id: item.id,
        externalId: item.externalId,
        label: item.label,
        categoryId: item.categoryId,
        categoryName: item.category?.name,
        eloRating: Math.round(item.eloRating * 10) / 10,
        ratingStdError: isFinite(stdError) ? Math.round(stdError * 10) / 10 : null,
        artistRank: item.artistRank,
        artistEloBoost: item.artistEloBoost,
        comparisonCount: item.comparisonCount,
        winCount: item.winCount,
        lossCount: item.lossCount,
        winRate:
          item.comparisonCount > 0
            ? Math.round((item.winCount / item.comparisonCount) * 100)
            : 0,
        leftCount: item.leftCount,
        rightCount: item.rightCount,
        positionBias:
          item.leftCount + item.rightCount > 0
            ? Math.round((item.leftCount / (item.leftCount + item.rightCount)) * 100)
            : 50,
        confidence: getConfidenceLevel(item.comparisonCount),
        // Bradley-Terry results (if computed)
        ...(btData
          ? {
              btAbility: Math.round(btData.ability * 1000) / 1000,
              btEloScale: Math.round(btAbilityToEloScale(btData.ability) * 10) / 10,
              btStdError: isFinite(btData.se) ? Math.round(btData.se * 1000) / 1000 : null,
            }
          : {}),
      };
    });

    // Get aggregate stats
    const totalSessions = await prisma.session.count({
      where: { studyId },
    });

    const completedSessions = await prisma.session.count({
      where: { studyId, isCompleted: true },
    });

    // Calculate position bias aggregate
    const totalLeftCount = items.reduce((sum, item) => sum + item.leftCount, 0);
    const totalRightCount = items.reduce((sum, item) => sum + item.rightCount, 0);
    const overallPositionBias =
      totalLeftCount + totalRightCount > 0
        ? Math.round((totalLeftCount / (totalLeftCount + totalRightCount)) * 100)
        : 50;

    // Graph connectivity check
    const connectivity = checkGraphConnectivity(
      items.map((i) => i.id),
      validComparisons,
    );

    // Circular triad detection
    const transitivity = detectCircularTriads(validComparisons);

    // Publishable threshold check
    const thresholdResult = isPublishableThreshold(
      items.map((i) => ({ id: i.id, comparisonCount: i.comparisonCount })),
      validComparisons,
      {
        minExposuresPerItem: study.minExposuresPerItem,
        minTotalComparisons: study.minTotalComparisons,
      },
    );

    logActivity('RANKINGS_VIEWED', {
      studyId,
      detail: `Rankings viewed (${validComparisons.length} valid comparisons)`,
      metadata: { categoryId: categoryId || null, includeBT },
    });

    return NextResponse.json({
      study: {
        id: study.id,
        title: study.title,
        rankingMethod: study.rankingMethod,
        targetTopN: study.targetTopN,
        hasCategorySeparation: study.hasCategorySeparation,
        minExposuresPerItem: study.minExposuresPerItem,
        adaptiveKFactor: study.adaptiveKFactor,
      },
      algoVersion: ALGO_VERSION,
      categories: study.categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      })),
      selectedCategory: categoryId,
      rankings,
      stats: {
        totalItems: items.length,
        totalComparisons: validComparisons.length,
        totalAllComparisons: allComparisons.length,
        totalSessions,
        completedSessions,
        overallPositionBias,
        positionBiasStatus:
          overallPositionBias >= 45 && overallPositionBias <= 55 ? 'good' : 'warning',
      },
      dataQuality: {
        dataStatus: thresholdResult.dataStatus,
        isPublishable: thresholdResult.isPublishable,
        publishableThreshold: thresholdResult.conditions,
        graphConnected: connectivity.connected,
        componentCount: connectivity.componentCount,
        isolatedItems: connectivity.isolatedItems.length,
        circularTriadCount: transitivity.circularTriadCount,
        transitivityIndex:
          transitivity.transitivityIndex >= 0
            ? Math.round(transitivity.transitivityIndex * 1000) / 1000
            : null,
        totalTriads: transitivity.totalTriads,
      },
    });
  } catch (error) {
    console.error('Rankings error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
