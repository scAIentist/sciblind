/**
 * Vote API
 *
 * POST /api/participate/[studyId]/vote
 *
 * Records a comparison vote and updates ELO ratings.
 * Includes fraud detection and full audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateEloChange } from '@/lib/ranking/elo';

// Minimum response time in ms (faster is flagged as suspicious)
const MIN_RESPONSE_TIME_MS = 500;

interface VoteBody {
  sessionToken: string;
  itemAId: string;
  itemBId: string;
  winnerId: string;
  leftItemId: string;
  rightItemId: string;
  categoryId?: string;
  responseTimeMs: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const body: VoteBody = await request.json();

    const {
      sessionToken,
      itemAId,
      itemBId,
      winnerId,
      leftItemId,
      rightItemId,
      categoryId,
      responseTimeMs,
    } = body;

    // Validate required fields
    if (!sessionToken || !itemAId || !itemBId || !winnerId || !leftItemId || !rightItemId) {
      return NextResponse.json(
        { error: 'Missing required fields', errorKey: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    // Validate winner is one of the items
    if (winnerId !== itemAId && winnerId !== itemBId) {
      return NextResponse.json(
        { error: 'Winner must be one of the compared items', errorKey: 'INVALID_WINNER' },
        { status: 400 }
      );
    }

    // Get session
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: {
        study: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session', errorKey: 'INVALID_SESSION' },
        { status: 401 }
      );
    }

    if (session.studyId !== studyId) {
      return NextResponse.json(
        { error: 'Session does not belong to this study', errorKey: 'SESSION_MISMATCH' },
        { status: 403 }
      );
    }

    if (session.isCompleted) {
      return NextResponse.json(
        { error: 'Session already completed', errorKey: 'SESSION_COMPLETED' },
        { status: 400 }
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
        { status: 404 }
      );
    }

    if (itemA.studyId !== studyId || itemB.studyId !== studyId) {
      return NextResponse.json(
        { error: 'Items do not belong to this study', errorKey: 'ITEMS_MISMATCH' },
        { status: 403 }
      );
    }

    // Validate category if study has category separation
    if (session.study.hasCategorySeparation) {
      if (itemA.categoryId !== itemB.categoryId) {
        return NextResponse.json(
          { error: 'Items must be from the same category', errorKey: 'CATEGORY_MISMATCH' },
          { status: 400 }
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
        { status: 400 }
      );
    }

    // Fraud detection
    let isFlagged = false;
    let flagReason: string | null = null;

    if (responseTimeMs && responseTimeMs < MIN_RESPONSE_TIME_MS) {
      isFlagged = true;
      flagReason = 'too_fast';
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
          responseTimeMs: responseTimeMs || null,
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
      const newAvgResponseTime = session.avgResponseTimeMs
        ? Math.round(
            (session.avgResponseTimeMs * session.comparisonCount + (responseTimeMs || 0)) /
              newComparisonCount
          )
        : responseTimeMs || null;

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

    return NextResponse.json({
      success: true,
      comparisonId: result.id,
      flagged: isFlagged,
      sessionComparisonCount: session.comparisonCount + 1,
    });
  } catch (error) {
    console.error('Vote error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
