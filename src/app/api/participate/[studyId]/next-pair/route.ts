/**
 * Next Pair API
 *
 * GET /api/participate/[studyId]/next-pair
 *
 * Returns the next pair of items to compare for a session.
 * Handles category-based matchmaking when hasCategorySeparation is enabled.
 *
 * Security features:
 * - Rate limiting (120 requests per minute per session)
 * - Input validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { selectNextPair, calculateRecommendedComparisons, getCategoryProgress, hasFullCoverage } from '@/lib/matchmaking';
import { isPublishableThreshold } from '@/lib/ranking/statistics';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';
import { logActivity } from '@/lib/logging';
import { isValidCuid, isValidSessionToken } from '@/lib/security/validation';

/**
 * Get items that have NOT yet appeared in any session comparison.
 * Used for progress bar calculation when coverage is not yet achieved.
 */
function getUnseenItems(items: { id: string }[], sessionComparisons: { itemAId: string; itemBId: string }[]) {
  const seen = new Set<string>();
  for (const comp of sessionComparisons) {
    seen.add(comp.itemAId);
    seen.add(comp.itemBId);
  }
  return items.filter((item) => !seen.has(item.id));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('token');
    const categoryId = searchParams.get('categoryId');

    // Validate studyId format
    if (!isValidCuid(studyId)) {
      return NextResponse.json(
        { error: 'Invalid study ID format', errorKey: 'INVALID_STUDY_ID' },
        { status: 400 }
      );
    }

    // Validate session token
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Session token is required', errorKey: 'TOKEN_REQUIRED' },
        { status: 400 }
      );
    }

    if (!isValidSessionToken(sessionToken)) {
      return NextResponse.json(
        { error: 'Invalid session token format', errorKey: 'INVALID_TOKEN' },
        { status: 400 }
      );
    }

    // Validate categoryId if provided
    if (categoryId && !isValidCuid(categoryId)) {
      return NextResponse.json(
        { error: 'Invalid category ID format', errorKey: 'INVALID_CATEGORY_ID' },
        { status: 400 }
      );
    }

    // Rate limit by session token
    const rateLimit = checkRateLimit(sessionToken, RATE_LIMITS.nextPair);
    const rateLimitHeaders = getRateLimitHeaders(rateLimit);

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please slow down.',
          errorKey: 'RATE_LIMITED',
          retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
        },
        { status: 429, headers: rateLimitHeaders }
      );
    }

    // Get session with study
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: {
        study: {
          include: {
            categories: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
        comparisons: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session', errorKey: 'INVALID_SESSION' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    if (session.studyId !== studyId) {
      return NextResponse.json(
        { error: 'Session does not belong to this study', errorKey: 'SESSION_MISMATCH' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    if (session.isCompleted) {
      return NextResponse.json(
        {
          complete: true,
          message: 'Session already completed',
        },
        { headers: rateLimitHeaders }
      );
    }

    const study = session.study;

    // Determine which category to get items from
    let targetCategoryId: string | null = null;

    if (study.hasCategorySeparation && study.categories.length > 0) {
      if (categoryId) {
        // Validate provided category
        const validCategory = study.categories.find((c) => c.id === categoryId);
        if (!validCategory) {
          return NextResponse.json(
            { error: 'Invalid category', errorKey: 'INVALID_CATEGORY' },
            { status: 400, headers: rateLimitHeaders }
          );
        }
        targetCategoryId = categoryId;
      } else {
        // Return category list for selection
        const categoryProgress = await Promise.all(
          study.categories.map(async (cat) => {
            const catItems = await prisma.item.findMany({
              where: { studyId, categoryId: cat.id },
            });
            const targetComparisons = calculateRecommendedComparisons(catItems.length, 5);
            const catComparisons = session.comparisons.filter((c) => c.categoryId === cat.id);
            const progress = getCategoryProgress(session.comparisons, cat.id, targetComparisons);
            const catCoverage = hasFullCoverage(catItems, catComparisons);

            // Override isComplete: require both target AND coverage
            const isComplete = progress.completed >= targetComparisons && catCoverage;

            return {
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              displayOrder: cat.displayOrder,
              itemCount: catItems.length,
              ...progress,
              isComplete,
            };
          })
        );

        return NextResponse.json(
          {
            requiresCategorySelection: true,
            categories: categoryProgress,
          },
          { headers: rateLimitHeaders }
        );
      }
    }

    // Get items for comparison
    const itemsQuery = {
      studyId,
      ...(targetCategoryId ? { categoryId: targetCategoryId } : {}),
    };

    const items = await prisma.item.findMany({
      where: itemsQuery,
    });

    if (items.length < 2) {
      return NextResponse.json(
        { error: 'Not enough items in category', errorKey: 'INSUFFICIENT_ITEMS' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Get comparisons for this session (in this category if applicable)
    const sessionComparisons = targetCategoryId
      ? session.comparisons.filter((c) => c.categoryId === targetCategoryId)
      : session.comparisons;

    // Calculate target comparisons
    const targetComparisons = calculateRecommendedComparisons(items.length, 5);

    // Check full coverage: every item must have been shown at least once
    const coverageAchieved = hasFullCoverage(items, sessionComparisons);

    // Category is complete ONLY if BOTH conditions are met:
    // 1. Reached target number of comparisons
    // 2. Every item in the category has been shown at least once (full coverage)
    const categoryIsComplete = sessionComparisons.length >= targetComparisons && coverageAchieved;

    if (categoryIsComplete) {
      // Update session progress
      const progress = (session.categoryProgress as Record<string, number>) || {};
      if (targetCategoryId) {
        progress[targetCategoryId] = sessionComparisons.length;
      }

      await prisma.session.update({
        where: { id: session.id },
        data: { categoryProgress: progress },
      });

      // Check global publishable threshold for this category
      const allStudyComparisons = await prisma.comparison.findMany({
        where: {
          studyId,
          ...(targetCategoryId ? { categoryId: targetCategoryId } : {}),
        },
        select: {
          winnerId: true,
          itemAId: true,
          itemBId: true,
          isFlagged: true,
          flagReason: true,
        },
      });

      const thresholdResult = isPublishableThreshold(
        items.map((i) => ({ id: i.id, comparisonCount: i.comparisonCount })),
        allStudyComparisons,
        {
          minExposuresPerItem: study.minExposuresPerItem,
          minTotalComparisons: study.minTotalComparisons,
        },
      );

      // Check if all categories are complete
      if (study.hasCategorySeparation) {
        const allComplete = await Promise.all(
          study.categories.map(async (cat) => {
            const catItems = await prisma.item.findMany({
              where: { studyId, categoryId: cat.id },
            });
            const catTarget = calculateRecommendedComparisons(catItems.length, 5);
            const catComparisons = session.comparisons.filter((c) => c.categoryId === cat.id);
            const catCoverage = hasFullCoverage(catItems, catComparisons);
            return catComparisons.length >= catTarget && catCoverage;
          })
        );

        if (allComplete.every(Boolean)) {
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
        detail: `Category completed (${sessionComparisons.length}/${targetComparisons} comparisons)`,
        metadata: { categoryId: targetCategoryId, comparisons: sessionComparisons.length, target: targetComparisons, thresholdMet: thresholdResult.isPublishable },
      });

      return NextResponse.json(
        {
          categoryComplete: true,
          categoryId: targetCategoryId,
          comparisonsInCategory: sessionComparisons.length,
          targetComparisons,
          thresholdMet: thresholdResult.isPublishable,
          dataStatus: thresholdResult.dataStatus,
          allowContinuedVoting: study.allowContinuedVoting && !thresholdResult.isPublishable,
        },
        { headers: rateLimitHeaders }
      );
    }

    // Select next pair
    const pair = selectNextPair(items, sessionComparisons);

    if (!pair) {
      // No more pairs available (all exhausted)
      return NextResponse.json(
        {
          categoryComplete: true,
          categoryId: targetCategoryId,
          noMorePairs: true,
        },
        { headers: rateLimitHeaders }
      );
    }

    // If we've passed the target but still don't have coverage, extend the
    // displayed target so the progress bar doesn't show >100% confusingly.
    // The effective target is the higher of: target comparisons OR current + remaining for coverage.
    const effectiveTarget = !coverageAchieved && sessionComparisons.length >= targetComparisons
      ? sessionComparisons.length + Math.ceil(getUnseenItems(items, sessionComparisons).length / 2) + 1
      : targetComparisons;

    // Return pair info without revealing internal identifiers unnecessarily
    return NextResponse.json(
      {
        itemA: {
          id: pair.itemA.id,
          imageUrl: pair.itemA.imageUrl,
          imageKey: pair.itemA.imageKey,
          text: pair.itemA.text,
        },
        itemB: {
          id: pair.itemB.id,
          imageUrl: pair.itemB.imageUrl,
          imageKey: pair.itemB.imageKey,
          text: pair.itemB.text,
        },
        leftItemId: pair.leftItemId,
        rightItemId: pair.rightItemId,
        categoryId: targetCategoryId,
        progress: {
          completed: sessionComparisons.length,
          target: effectiveTarget,
          percentage: Math.min(99, Math.round((sessionComparisons.length / effectiveTarget) * 100)),
        },
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Next pair error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
