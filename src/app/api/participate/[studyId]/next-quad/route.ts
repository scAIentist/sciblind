/**
 * Next Quad API
 *
 * GET /api/participate/[studyId]/next-quad
 *
 * Returns the next 4 items to compare for quadruplet mode.
 * User picks 1 best of 4, generating 3 pairwise wins.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  selectNextQuad,
  selectNextQuadWinnersOnly,
  calculateRecommendedQuadComparisons,
  calculateTournamentQuads,
  getSessionWinnerIds,
  hasFullCoverage,
} from '@/lib/matchmaking';
import { isPublishableThreshold } from '@/lib/ranking/statistics';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';
import { isValidCuid, isValidSessionToken } from '@/lib/security/validation';
import { logActivity } from '@/lib/logging';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('token');
    const categoryId = searchParams.get('categoryId');

    // Validate inputs
    if (!isValidCuid(studyId)) {
      return NextResponse.json(
        { error: 'Invalid study ID format', errorKey: 'INVALID_STUDY_ID' },
        { status: 400 }
      );
    }

    if (!sessionToken || !isValidSessionToken(sessionToken)) {
      return NextResponse.json(
        { error: 'Valid session token required', errorKey: 'TOKEN_REQUIRED' },
        { status: 400 }
      );
    }

    if (categoryId && !isValidCuid(categoryId)) {
      return NextResponse.json(
        { error: 'Invalid category ID format', errorKey: 'INVALID_CATEGORY_ID' },
        { status: 400 }
      );
    }

    // Rate limit
    const rateLimit = checkRateLimit(sessionToken, RATE_LIMITS.nextPair);
    const rateLimitHeaders = getRateLimitHeaders(rateLimit);

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests', errorKey: 'RATE_LIMITED' },
        { status: 429, headers: rateLimitHeaders }
      );
    }

    // Get session - OPTIMIZED: Select only needed fields
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      select: {
        id: true,
        studyId: true,
        isCompleted: true,
        comparisonCount: true,
        study: {
          select: {
            id: true,
            hasCategorySeparation: true,
            allowContinuedVoting: true,
            minExposuresPerItem: true,
            minTotalComparisons: true,
            categories: {
              orderBy: { displayOrder: 'asc' },
              select: { id: true, name: true, slug: true, displayOrder: true },
            },
          },
        },
      },
    });

    if (!session || session.studyId !== studyId) {
      return NextResponse.json(
        { error: 'Invalid session', errorKey: 'INVALID_SESSION' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    if (session.isCompleted) {
      return NextResponse.json(
        { complete: true, message: 'Session already completed' },
        { headers: rateLimitHeaders }
      );
    }

    const study = session.study;

    // Handle category selection if needed
    if (study.hasCategorySeparation && !categoryId) {
      // OPTIMIZED: Parallel fetch of items and comparisons
      const [allItems, sessionComparisons] = await Promise.all([
        prisma.item.findMany({
          where: { studyId },
          select: { id: true, categoryId: true },
        }),
        prisma.comparison.findMany({
          where: { sessionId: session.id },
          select: { id: true, itemAId: true, itemBId: true, categoryId: true },
        }),
      ]);

      const categoryProgress = study.categories.map((cat) => {
        const catItems = allItems.filter((i) => i.categoryId === cat.id);
        const catBaseTarget = calculateRecommendedQuadComparisons(catItems.length, 5);
        const catComparisons = sessionComparisons.filter((c) => c.categoryId === cat.id);
        // For quads, count unique quad-votes (each quad creates multiple comparison records)
        const rawCount = catComparisons.length;
        const perfectQuads = Math.floor(rawCount / 3);
        const remainder = rawCount % 3;
        // Legacy pairwise comparisons handling
        const isPairwiseHeavy = rawCount > 0 && (remainder > 0 || rawCount >= catBaseTarget);
        const quadCount = isPairwiseHeavy ? Math.max(perfectQuads, Math.ceil(rawCount / 2)) : perfectQuads;
        const catCoverage = hasFullCoverage(catItems as any, catComparisons as any);

        // Tournament phase: ALWAYS show full target (baseTarget + 4 tournament quads)
        // This prevents progress bar from jumping when tournament phase starts
        const TOURNAMENT_QUADS = 4;
        const fullTarget = catBaseTarget + TOURNAMENT_QUADS;

        // Completion: if allowContinuedVoting=false, stop at target; otherwise need coverage too
        const isComplete = study.allowContinuedVoting
          ? (quadCount >= fullTarget && catCoverage)
          : (quadCount >= fullTarget);

        return {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          displayOrder: cat.displayOrder,
          itemCount: catItems.length,
          completed: quadCount,
          target: fullTarget,
          percentage: Math.min(100, Math.round((quadCount / fullTarget) * 100)),
          isComplete,
        };
      });

      return NextResponse.json(
        { requiresCategorySelection: true, categories: categoryProgress },
        { headers: rateLimitHeaders }
      );
    }

    // OPTIMIZED: Parallel fetch of items and session comparisons
    const [items, sessionComparisons] = await Promise.all([
      prisma.item.findMany({
        where: {
          studyId,
          ...(categoryId ? { categoryId } : {}),
        },
      }),
      prisma.comparison.findMany({
        where: {
          sessionId: session.id,
          ...(categoryId ? { categoryId } : {}),
        },
        select: {
          id: true,
          itemAId: true,
          itemBId: true,
          winnerId: true,
          categoryId: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (items.length < 4) {
      return NextResponse.json(
        { error: 'Not enough items for quad mode (need 4+)', errorKey: 'INSUFFICIENT_ITEMS' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Calculate progress (quads = comparisons / 3, with legacy pairwise handling)
    const baseTarget = calculateRecommendedQuadComparisons(items.length, 5);
    const rawComparisons = sessionComparisons.length;
    const perfectQuads = Math.floor(rawComparisons / 3);
    const remainder = rawComparisons % 3;
    // Handle legacy pairwise comparisons (count them as equivalent coverage)
    const isPairwiseHeavy = rawComparisons > 0 && (remainder > 0 || rawComparisons >= baseTarget);
    const completedQuads = isPairwiseHeavy ? Math.max(perfectQuads, Math.ceil(rawComparisons / 2)) : perfectQuads;
    const coverageAchieved = hasFullCoverage(items, sessionComparisons as any);

    // Tournament phase: ALWAYS show full target from the start (baseTarget + 4)
    // This prevents progress bar from jumping when tournament phase starts
    const TOURNAMENT_QUADS = 4;
    const fullTarget = baseTarget + TOURNAMENT_QUADS;

    // Determine phase - coverage phase complete when baseTarget AND coverage achieved
    const coveragePhaseComplete = completedQuads >= baseTarget && coverageAchieved;
    const inTournamentPhase = coveragePhaseComplete && completedQuads < fullTarget;

    // Check completion - by default require FULL target AND coverage
    // However, if allowContinuedVoting=false, stop at target regardless of coverage
    const categoryDone = study.allowContinuedVoting
      ? (completedQuads >= fullTarget && coverageAchieved)  // Need both
      : (completedQuads >= fullTarget);  // Just target is enough

    if (categoryDone) {
      // Category complete - check threshold for messaging
      const [allStudyComparisons, allStudyItems] = await Promise.all([
        prisma.comparison.findMany({
          where: {
            studyId,
            ...(categoryId ? { categoryId } : {}),
          },
          select: {
            winnerId: true,
            itemAId: true,
            itemBId: true,
            isFlagged: true,
            flagReason: true,
          },
        }),
        prisma.item.findMany({
          where: {
            studyId,
            ...(categoryId ? { categoryId } : {}),
          },
          select: { id: true, comparisonCount: true, categoryId: true },
        }),
      ]);

      const thresholdResult = isPublishableThreshold(
        allStudyItems.map((i) => ({ id: i.id, comparisonCount: i.comparisonCount })),
        allStudyComparisons,
        {
          minExposuresPerItem: study.minExposuresPerItem,
          minTotalComparisons: study.minTotalComparisons,
        },
      );

      if (study.hasCategorySeparation) {
        // Check all categories complete
        const [allSessionComps, allItems] = await Promise.all([
          prisma.comparison.findMany({
            where: { sessionId: session.id },
            select: { categoryId: true },
          }),
          prisma.item.findMany({
            where: { studyId },
            select: { id: true, categoryId: true },
          }),
        ]);

        const allComplete = study.categories.every((cat) => {
          const catItems = allItems.filter((i) => i.categoryId === cat.id);
          const catBaseTarget = calculateRecommendedQuadComparisons(catItems.length, 5);
          const catComps = allSessionComps.filter((c) => c.categoryId === cat.id);
          const rawCount = catComps.length;
          const quadCount = Math.floor(rawCount / 3);
          const catCoverage = hasFullCoverage(catItems as any, catComps as any);
          const catFullTarget = catBaseTarget + TOURNAMENT_QUADS;
          return study.allowContinuedVoting
            ? (quadCount >= catFullTarget && catCoverage)
            : (quadCount >= catFullTarget);
        });

        if (allComplete) {
          await prisma.session.update({
            where: { id: session.id },
            data: { isCompleted: true },
          });

          logActivity('SESSION_COMPLETED', {
            studyId,
            sessionId: session.id,
            detail: `Session completed all categories (${session.comparisonCount} total comparisons)`,
            metadata: { thresholdMet: thresholdResult.isPublishable, dataStatus: thresholdResult.dataStatus },
          });

          return NextResponse.json(
            {
              complete: true,
              allCategoriesComplete: true,
              thresholdMet: thresholdResult.isPublishable,
              dataStatus: thresholdResult.dataStatus,
            },
            { headers: rateLimitHeaders }
          );
        }
      }

      logActivity('CATEGORY_COMPLETED', {
        studyId,
        sessionId: session.id,
        detail: `Category completed (${completedQuads}/${fullTarget} quads)`,
        metadata: { categoryId, quads: completedQuads, target: fullTarget, thresholdMet: thresholdResult.isPublishable },
      });

      return NextResponse.json(
        {
          categoryComplete: true,
          categoryId,
          comparisonsInCategory: completedQuads,
          targetComparisons: fullTarget,
          thresholdMet: thresholdResult.isPublishable,
          dataStatus: thresholdResult.dataStatus,
          allowContinuedVoting: study.allowContinuedVoting && !thresholdResult.isPublishable,
        },
        { headers: rateLimitHeaders }
      );
    }

    // Select next quad - use winners-only in tournament phase for more refined rankings
    let quad;
    if (inTournamentPhase) {
      // Tournament phase: select from winners only to refine top 4
      quad = selectNextQuadWinnersOnly(items, sessionComparisons as any);
      if (!quad) {
        // Fallback to regular selection if not enough winners
        quad = selectNextQuad(items, sessionComparisons as any);
      }
    } else {
      // Coverage phase: regular selection to ensure all items are seen
      quad = selectNextQuad(items, sessionComparisons as any);
    }

    if (!quad) {
      return NextResponse.json(
        { categoryComplete: true, noMoreItems: true },
        { headers: rateLimitHeaders }
      );
    }

    // Map items for response
    const responseItems = quad.positions.map((id) => {
      const item = quad.items.find((i) => i.id === id)!;
      return {
        id: item.id,
        imageUrl: item.imageUrl,
        imageKey: item.imageKey,
        text: item.text,
      };
    });

    return NextResponse.json(
      {
        items: responseItems,
        positions: quad.positions,
        categoryId,
        progress: {
          completed: completedQuads,
          target: fullTarget,
          percentage: Math.min(99, Math.round((completedQuads / fullTarget) * 100)),
        },
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Next quad error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
