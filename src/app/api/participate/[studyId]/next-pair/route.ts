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
import { selectNextPair, calculateRecommendedComparisons, getCategoryProgress } from '@/lib/matchmaking';
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
            const itemCount = await prisma.item.count({
              where: { studyId, categoryId: cat.id },
            });
            const targetComparisons = calculateRecommendedComparisons(itemCount, 5);
            const progress = getCategoryProgress(session.comparisons, cat.id, targetComparisons);

            return {
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              displayOrder: cat.displayOrder,
              itemCount,
              ...progress,
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

    // Check if category is complete
    if (sessionComparisons.length >= targetComparisons) {
      // Update session progress
      const progress = (session.categoryProgress as Record<string, number>) || {};
      if (targetCategoryId) {
        progress[targetCategoryId] = sessionComparisons.length;
      }

      await prisma.session.update({
        where: { id: session.id },
        data: { categoryProgress: progress },
      });

      // Check if all categories are complete
      if (study.hasCategorySeparation) {
        const allComplete = await Promise.all(
          study.categories.map(async (cat) => {
            const catItemCount = await prisma.item.count({
              where: { studyId, categoryId: cat.id },
            });
            const catTarget = calculateRecommendedComparisons(catItemCount, 5);
            const catComparisons = session.comparisons.filter((c) => c.categoryId === cat.id);
            return catComparisons.length >= catTarget;
          })
        );

        if (allComplete.every(Boolean)) {
          await prisma.session.update({
            where: { id: session.id },
            data: { isCompleted: true },
          });

          return NextResponse.json(
            {
              complete: true,
              allCategoriesComplete: true,
            },
            { headers: rateLimitHeaders }
          );
        }
      }

      return NextResponse.json(
        {
          categoryComplete: true,
          categoryId: targetCategoryId,
          comparisonsInCategory: sessionComparisons.length,
          targetComparisons,
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
          target: targetComparisons,
          percentage: Math.round((sessionComparisons.length / targetComparisons) * 100),
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
