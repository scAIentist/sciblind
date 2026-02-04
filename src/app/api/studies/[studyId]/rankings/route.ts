/**
 * Rankings API
 *
 * GET /api/studies/[studyId]/rankings
 *
 * Returns current rankings for a study, optionally filtered by category.
 * Includes ELO ratings, win/loss records, and confidence indicators.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { compareItemsForRanking, getConfidenceLevel } from '@/lib/ranking/elo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const topN = parseInt(searchParams.get('topN') || '0', 10);

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

    // Sort items by ranking criteria
    const sortedItems = items.sort(compareItemsForRanking);

    // Apply topN limit if specified
    const rankedItems = topN > 0 ? sortedItems.slice(0, topN) : sortedItems;

    // Format response
    const rankings = rankedItems.map((item, index) => ({
      rank: index + 1,
      id: item.id,
      externalId: item.externalId,
      label: item.label,
      categoryId: item.categoryId,
      categoryName: item.category?.name,
      eloRating: Math.round(item.eloRating * 10) / 10,
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
    }));

    // Get aggregate stats
    const totalComparisons = await prisma.comparison.count({
      where: { studyId, ...(categoryId ? { categoryId } : {}) },
    });

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

    return NextResponse.json({
      study: {
        id: study.id,
        title: study.title,
        rankingMethod: study.rankingMethod,
        targetTopN: study.targetTopN,
        hasCategorySeparation: study.hasCategorySeparation,
      },
      categories: study.categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      })),
      selectedCategory: categoryId,
      rankings,
      stats: {
        totalItems: items.length,
        totalComparisons,
        totalSessions,
        completedSessions,
        overallPositionBias,
        positionBiasStatus:
          overallPositionBias >= 45 && overallPositionBias <= 55 ? 'good' : 'warning',
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
