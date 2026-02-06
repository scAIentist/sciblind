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
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';
import { isValidCuid, isValidSessionToken } from '@/lib/security/validation';

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

    // Get session
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: {
        study: {
          include: {
            categories: { orderBy: { displayOrder: 'asc' } },
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
      const allItems = await prisma.item.findMany({
        where: { studyId },
        select: { id: true, categoryId: true },
      });

      const sessionComparisons = await prisma.comparison.findMany({
        where: { sessionId: session.id },
        select: { id: true, itemAId: true, itemBId: true, categoryId: true },
      });

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

        // Tournament phase: FIXED 4 extra quads once coverage is achieved
        const coveragePhaseComplete = quadCount >= catBaseTarget && catCoverage;
        const tournamentQuads = coveragePhaseComplete ? 4 : 0;
        const extendedTarget = catBaseTarget + tournamentQuads;

        // ALWAYS require coverage AND extended target for completion
        const isComplete = quadCount >= extendedTarget && catCoverage;

        return {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          displayOrder: cat.displayOrder,
          itemCount: catItems.length,
          completed: quadCount,
          target: extendedTarget,
          percentage: Math.min(100, Math.round((quadCount / extendedTarget) * 100)),
          isComplete,
        };
      });

      return NextResponse.json(
        { requiresCategorySelection: true, categories: categoryProgress },
        { headers: rateLimitHeaders }
      );
    }

    // Get items for this category
    const items = await prisma.item.findMany({
      where: {
        studyId,
        ...(categoryId ? { categoryId } : {}),
      },
    });

    if (items.length < 4) {
      return NextResponse.json(
        { error: 'Not enough items for quad mode (need 4+)', errorKey: 'INSUFFICIENT_ITEMS' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Get fresh session comparisons
    const sessionComparisons = await prisma.comparison.findMany({
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
    });

    // Calculate progress (quads = comparisons / 3, with legacy pairwise handling)
    const baseTarget = calculateRecommendedQuadComparisons(items.length, 5);
    const rawComparisons = sessionComparisons.length;
    const perfectQuads = Math.floor(rawComparisons / 3);
    const remainder = rawComparisons % 3;
    // Handle legacy pairwise comparisons (count them as equivalent coverage)
    const isPairwiseHeavy = rawComparisons > 0 && (remainder > 0 || rawComparisons >= baseTarget);
    const completedQuads = isPairwiseHeavy ? Math.max(perfectQuads, Math.ceil(rawComparisons / 2)) : perfectQuads;
    const coverageAchieved = hasFullCoverage(items, sessionComparisons as any);

    // Tournament phase: Calculate extended target for winner refinement
    // FIXED: Use a stable tournament quota (always 4 extra quads) to avoid progress bar jumping
    // This prevents the target from changing as more winners accumulate during tournament
    const coveragePhaseComplete = completedQuads >= baseTarget && coverageAchieved;
    const tournamentQuads = coveragePhaseComplete ? 4 : 0; // Fixed 4 quads for tournament
    const extendedTarget = baseTarget + tournamentQuads;

    // Determine phase
    const inTournamentPhase = coveragePhaseComplete && completedQuads < extendedTarget;

    // Check completion - require EXTENDED target AND coverage
    // This ensures tournament phase completes before category is done
    if (completedQuads >= extendedTarget && coverageAchieved) {
      // Category complete
      if (study.hasCategorySeparation) {
        // Check all categories
        const allSessionComps = await prisma.comparison.findMany({
          where: { sessionId: session.id },
          select: { categoryId: true },
        });

        const allItems = await prisma.item.findMany({
          where: { studyId },
          select: { id: true, categoryId: true },
        });

        const allComplete = study.categories.every((cat) => {
          const catItems = allItems.filter((i) => i.categoryId === cat.id);
          const catBaseTarget = calculateRecommendedQuadComparisons(catItems.length, 5);
          const catComps = allSessionComps.filter((c) => c.categoryId === cat.id);
          const rawCount = catComps.length;
          const quadCount = Math.floor(rawCount / 3);
          const catCoverage = hasFullCoverage(catItems as any, catComps as any);
          // Tournament phase: FIXED 4 extra quads once coverage achieved
          const coveragePhaseComplete = quadCount >= catBaseTarget && catCoverage;
          const catTournamentQuads = coveragePhaseComplete ? 4 : 0;
          const catExtendedTarget = catBaseTarget + catTournamentQuads;
          return quadCount >= catExtendedTarget && catCoverage;
        });

        if (allComplete) {
          await prisma.session.update({
            where: { id: session.id },
            data: { isCompleted: true },
          });
          return NextResponse.json(
            { complete: true, allCategoriesComplete: true },
            { headers: rateLimitHeaders }
          );
        }
      }

      return NextResponse.json(
        {
          categoryComplete: true,
          categoryId,
          comparisonsInCategory: completedQuads,
          targetComparisons: extendedTarget,
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
          target: extendedTarget,
          percentage: Math.min(99, Math.round((completedQuads / extendedTarget) * 100)),
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
