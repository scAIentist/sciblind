/**
 * Vote API
 *
 * POST /api/participate/[studyId]/vote
 *
 * Records a comparison vote and updates ELO ratings.
 *
 * Security features:
 * - Rate limiting (60 votes per minute per session)
 * - Strict input validation
 * - Fraud detection (response time analysis)
 * - Full audit trail
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateEloChange } from '@/lib/ranking/elo';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';
import { validateVoteRequest, isValidCuid } from '@/lib/security/validation';

// Minimum response time in ms (faster is flagged as suspicious)
const MIN_RESPONSE_TIME_MS = 500;
// Maximum response time (likely AFK or bot patterns)
const MAX_RESPONSE_TIME_MS = 300000; // 5 minutes

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  let sessionToken: string | null = null;

  try {
    const { studyId } = await params;

    // Validate studyId format first
    if (!isValidCuid(studyId)) {
      return NextResponse.json(
        { error: 'Invalid study ID format', errorKey: 'INVALID_STUDY_ID' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', errorKey: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const validation = validateVoteRequest(body);
    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        { error: validation.error || 'Invalid request', errorKey: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const {
      sessionToken: token,
      itemAId,
      itemBId,
      winnerId,
      leftItemId,
      rightItemId,
      categoryId,
      responseTimeMs,
    } = validation.data;

    sessionToken = token;

    // Rate limit by session token
    const rateLimit = checkRateLimit(token, RATE_LIMITS.vote);
    const rateLimitHeaders = getRateLimitHeaders(rateLimit);

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Voting too fast. Please slow down.',
          errorKey: 'RATE_LIMITED',
          retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
        },
        { status: 429, headers: rateLimitHeaders }
      );
    }

    // Get session
    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        study: true,
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
        { error: 'Session already completed', errorKey: 'SESSION_COMPLETED' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Get items
    const [itemA, itemB] = await Promise.all([
      prisma.item.findUnique({ where: { id: itemAId } }),
      prisma.item.findUnique({ where: { id: itemBId } }),
    ]);

    if (!itemA || !itemB) {
      return NextResponse.json(
        { error: 'Items not found', errorKey: 'ITEMS_NOT_FOUND' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (itemA.studyId !== studyId || itemB.studyId !== studyId) {
      return NextResponse.json(
        { error: 'Items do not belong to this study', errorKey: 'ITEMS_MISMATCH' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Validate category if study has category separation
    if (session.study.hasCategorySeparation) {
      if (itemA.categoryId !== itemB.categoryId) {
        return NextResponse.json(
          { error: 'Items must be from the same category', errorKey: 'CATEGORY_MISMATCH' },
          { status: 400, headers: rateLimitHeaders }
        );
      }
    }

    // Check for duplicate comparison
    const existingComparison = await prisma.comparison.findFirst({
      where: {
        sessionId: session.id,
        OR: [
          { itemAId, itemBId },
          { itemAId: itemBId, itemBId: itemAId },
        ],
      },
    });

    if (existingComparison) {
      return NextResponse.json(
        { error: 'This pair has already been compared', errorKey: 'DUPLICATE_COMPARISON' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Fraud detection
    let isFlagged = false;
    let flagReason: string | null = null;

    if (responseTimeMs !== undefined) {
      if (responseTimeMs < MIN_RESPONSE_TIME_MS) {
        isFlagged = true;
        flagReason = 'too_fast';
      } else if (responseTimeMs > MAX_RESPONSE_TIME_MS) {
        isFlagged = true;
        flagReason = 'too_slow';
      }
    }

    // Determine winner and loser
    const winner = winnerId === itemAId ? itemA : itemB;
    const loser = winnerId === itemAId ? itemB : itemA;

    // Calculate ELO changes
    const eloResult = calculateEloChange(
      winner.eloRating,
      loser.eloRating,
      session.study.eloKFactor
    );

    // Create comparison and update everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create comparison record
      const comparison = await tx.comparison.create({
        data: {
          studyId,
          sessionId: session.id,
          categoryId: categoryId || itemA.categoryId,
          itemAId,
          itemBId,
          winnerId,
          leftItemId,
          rightItemId,
          responseTimeMs: responseTimeMs ?? null,
          isFlagged,
          flagReason,
        },
      });

      // Update winner stats
      await tx.item.update({
        where: { id: winner.id },
        data: {
          eloRating: eloResult.winnerNewRating,
          eloGames: { increment: 1 },
          comparisonCount: { increment: 1 },
          winCount: { increment: 1 },
          leftCount: leftItemId === winner.id ? { increment: 1 } : undefined,
          rightCount: rightItemId === winner.id ? { increment: 1 } : undefined,
        },
      });

      // Update loser stats
      await tx.item.update({
        where: { id: loser.id },
        data: {
          eloRating: eloResult.loserNewRating,
          eloGames: { increment: 1 },
          comparisonCount: { increment: 1 },
          lossCount: { increment: 1 },
          leftCount: leftItemId === loser.id ? { increment: 1 } : undefined,
          rightCount: rightItemId === loser.id ? { increment: 1 } : undefined,
        },
      });

      // Update session stats
      const newComparisonCount = session.comparisonCount + 1;
      const validResponseTime = responseTimeMs !== undefined && responseTimeMs > 0;
      const newAvgResponseTime =
        validResponseTime && session.avgResponseTimeMs
          ? Math.round(
              (session.avgResponseTimeMs * session.comparisonCount + responseTimeMs) /
                newComparisonCount
            )
          : validResponseTime
            ? responseTimeMs
            : session.avgResponseTimeMs;

      await tx.session.update({
        where: { id: session.id },
        data: {
          comparisonCount: newComparisonCount,
          avgResponseTimeMs: newAvgResponseTime,
          isFlagged: session.isFlagged || isFlagged,
          flagReason: session.flagReason || flagReason,
        },
      });

      // Record usage metrics
      await tx.usageMetrics.create({
        data: {
          studyId,
          eventType: 'COMPARISON',
          count: 1,
        },
      });

      return comparison;
    });

    return NextResponse.json(
      {
        success: true,
        comparisonId: result.id,
        flagged: isFlagged,
        sessionComparisonCount: session.comparisonCount + 1,
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Vote error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
