/**
 * Vote Quad API
 *
 * POST /api/participate/[studyId]/vote-quad
 *
 * Records a quadruplet vote: user picks 1 best of 4.
 * This generates 3 pairwise wins (winner beats each of the 3 losers).
 *
 * ELO updates:
 * - Winner gets 3 ELO boosts (one vs each loser)
 * - Each loser gets 1 ELO penalty (vs the winner only)
 * - Losers do NOT compete against each other (no transitivity assumption)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateEloChange, calculateAdaptiveK } from '@/lib/ranking/elo';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';
import { isValidCuid, isValidSessionToken } from '@/lib/security/validation';
import { logActivity } from '@/lib/logging';

// Default thresholds (overridden by study settings)
const DEFAULT_MIN_RESPONSE_TIME_MS = 500;
const DEFAULT_MAX_RESPONSE_TIME_MS = 300000;

interface VoteQuadBody {
  sessionToken: string;
  itemIds: string[];      // All 4 item IDs
  winnerId: string;       // The selected best item
  positions: string[];    // Display order (for bias tracking)
  categoryId?: string;
  responseTimeMs?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;

    if (!isValidCuid(studyId)) {
      return NextResponse.json(
        { error: 'Invalid study ID', errorKey: 'INVALID_STUDY_ID' },
        { status: 400 }
      );
    }

    let body: VoteQuadBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON', errorKey: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const { sessionToken, itemIds, winnerId, positions, categoryId, responseTimeMs } = body;

    // Validate inputs
    if (!sessionToken || !isValidSessionToken(sessionToken)) {
      return NextResponse.json(
        { error: 'Invalid session token', errorKey: 'INVALID_TOKEN' },
        { status: 400 }
      );
    }

    if (!Array.isArray(itemIds) || itemIds.length !== 4) {
      return NextResponse.json(
        { error: 'Must provide exactly 4 item IDs', errorKey: 'INVALID_ITEMS' },
        { status: 400 }
      );
    }

    if (!itemIds.every(isValidCuid)) {
      return NextResponse.json(
        { error: 'Invalid item ID format', errorKey: 'INVALID_ITEM_ID' },
        { status: 400 }
      );
    }

    if (!winnerId || !isValidCuid(winnerId) || !itemIds.includes(winnerId)) {
      return NextResponse.json(
        { error: 'Invalid winner ID', errorKey: 'INVALID_WINNER' },
        { status: 400 }
      );
    }

    // Rate limit
    const rateLimit = checkRateLimit(sessionToken, RATE_LIMITS.vote);
    const rateLimitHeaders = getRateLimitHeaders(rateLimit);

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Voting too fast', errorKey: 'RATE_LIMITED' },
        { status: 429, headers: rateLimitHeaders }
      );
    }

    // Get session and items - OPTIMIZED: Single query for all items instead of 4 separate queries
    const [session, itemsResult] = await Promise.all([
      prisma.session.findUnique({
        where: { token: sessionToken },
        include: {
          study: {
            select: {
              id: true,
              eloKFactor: true,
              adaptiveKFactor: true,
              hasCategorySeparation: true,
              minResponseTimeMs: true,
              maxResponseTimeMs: true,
              excludeFlaggedFromElo: true,
            },
          },
        },
      }),
      prisma.item.findMany({
        where: { id: { in: itemIds } },
      }),
    ]);

    // Reorder items to match itemIds order for consistency
    const items = itemIds.map((id) => itemsResult.find((item) => item.id === id));

    if (!session || session.studyId !== studyId) {
      return NextResponse.json(
        { error: 'Invalid session', errorKey: 'INVALID_SESSION' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    if (session.isCompleted) {
      return NextResponse.json(
        { error: 'Session completed', errorKey: 'SESSION_COMPLETED' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (items.some((item) => !item || item.studyId !== studyId)) {
      return NextResponse.json(
        { error: 'Items not found or mismatch', errorKey: 'ITEMS_NOT_FOUND' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    const winner = items.find((i) => i!.id === winnerId)!;
    const losers = items.filter((i) => i!.id !== winnerId) as NonNullable<typeof items[0]>[];

    // Fraud detection using study's configurable thresholds
    const minResponseTime = session.study.minResponseTimeMs ?? DEFAULT_MIN_RESPONSE_TIME_MS;
    const maxResponseTime = session.study.maxResponseTimeMs ?? DEFAULT_MAX_RESPONSE_TIME_MS;
    const excludeFlaggedFromElo = session.study.excludeFlaggedFromElo ?? false;

    let isFlagged = false;
    let flagReason: string | null = null;

    if (responseTimeMs !== undefined) {
      if (responseTimeMs < minResponseTime) {
        isFlagged = true;
        flagReason = 'too_fast';
      } else if (responseTimeMs > maxResponseTime) {
        isFlagged = true;
        flagReason = 'too_slow';
      }
    }

    const isTestSession = session.isTestSession;
    const effectiveCategoryId = categoryId || winner.categoryId;

    // Transaction: create 3 comparison records and update ELO
    const result = await prisma.$transaction(async (tx) => {
      const comparisons = [];

      // Create 3 comparison records (winner vs each loser)
      for (let i = 0; i < losers.length; i++) {
        const loser = losers[i];

        // Determine positions based on display order
        const winnerPos = positions.indexOf(winnerId);
        const loserPos = positions.indexOf(loser.id);

        const comparison = await tx.comparison.create({
          data: {
            studyId,
            sessionId: session.id,
            categoryId: effectiveCategoryId,
            itemAId: winnerId,
            itemBId: loser.id,
            winnerId,
            leftItemId: winnerPos < loserPos ? winnerId : loser.id,
            rightItemId: winnerPos < loserPos ? loser.id : winnerId,
            responseTimeMs: i === 0 ? responseTimeMs : null, // Only first gets response time
            isFlagged: isTestSession ? true : isFlagged,
            flagReason: isTestSession ? 'test_session' : flagReason,
            algoVersion: 'sciblind-v2-quad',
          },
        });
        comparisons.push(comparison);

        // Update ELO for non-test sessions (and non-flagged if excludeFlaggedFromElo is enabled)
        const shouldUpdateElo = !isTestSession && !(isFlagged && excludeFlaggedFromElo);
        if (shouldUpdateElo) {
          const effectiveK = session.study.adaptiveKFactor
            ? calculateAdaptiveK(session.study.eloKFactor, winner.eloGames, loser.eloGames)
            : session.study.eloKFactor;

          const eloResult = calculateEloChange(
            winner.eloRating,
            loser.eloRating,
            effectiveK
          );

          // Update winner (accumulate all 3 ELO gains)
          await tx.item.update({
            where: { id: winner.id },
            data: {
              eloRating: { increment: eloResult.winnerNewRating - winner.eloRating },
              eloGames: { increment: 1 },
              comparisonCount: { increment: 1 },
              winCount: { increment: 1 },
            },
          });

          // Update loser
          await tx.item.update({
            where: { id: loser.id },
            data: {
              eloRating: eloResult.loserNewRating,
              eloGames: { increment: 1 },
              comparisonCount: { increment: 1 },
              lossCount: { increment: 1 },
            },
          });
        } else if (!isTestSession) {
          // Still update counts for flagged votes (when excludeFlaggedFromElo), just not ELO
          await tx.item.update({
            where: { id: winner.id },
            data: {
              comparisonCount: { increment: 1 },
              winCount: { increment: 1 },
            },
          });
          await tx.item.update({
            where: { id: loser.id },
            data: {
              comparisonCount: { increment: 1 },
              lossCount: { increment: 1 },
            },
          });
        }

        // Record usage metric (always, except for test sessions)
        if (!isTestSession) {
          await tx.usageMetrics.create({
            data: {
              studyId,
              eventType: 'COMPARISON',
              count: 1,
            },
          });
        }
      }

      // Update session stats
      const newComparisonCount = session.comparisonCount + 3; // 3 comparisons per quad
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

      return comparisons;
    });

    logActivity(isFlagged || isTestSession ? 'VOTE_FLAGGED' : 'VOTE_CAST', {
      studyId,
      sessionId: session.id,
      detail: `${isTestSession ? '[TEST] ' : ''}Quad vote: ${winnerId} won against 3 (${responseTimeMs ?? '?'}ms)`,
      metadata: {
        comparisonIds: result.map((c) => c.id),
        itemIds,
        winnerId,
        positions,
        categoryId: effectiveCategoryId,
        responseTimeMs,
        isQuadVote: true,
        isTestSession,
      },
    });

    return NextResponse.json(
      {
        success: true,
        comparisonCount: 3,
        sessionComparisonCount: session.comparisonCount + 3,
        isTestMode: isTestSession,
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Vote quad error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
