/**
 * Personal Rankings API
 *
 * GET /api/participate/[studyId]/personal-rankings?token=...
 *
 * Returns the top 4 items per category based on THIS participant's votes only.
 * Uses a simple win-count ranking for the participant's session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isValidCuid, isValidSessionToken } from '@/lib/security/validation';

const SUPABASE_STORAGE_URL = 'https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images';

function buildImageUrl(imageKey: string | null): string | null {
  if (!imageKey) return null;
  const parts = imageKey.split('/');
  if (parts[0] === 'izvrs' && parts.length === 3) {
    return `${SUPABASE_STORAGE_URL}/${parts[1]}/${parts[2]}`;
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('token');

    if (!isValidCuid(studyId)) {
      return NextResponse.json(
        { error: 'Invalid study ID format' },
        { status: 400 }
      );
    }

    if (!sessionToken || !isValidSessionToken(sessionToken)) {
      return NextResponse.json(
        { error: 'Valid session token required' },
        { status: 400 }
      );
    }

    // Get session with comparisons
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: {
        comparisons: {
          select: {
            winnerId: true,
            categoryId: true,
          },
        },
        study: {
          include: {
            categories: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!session || session.studyId !== studyId) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Count wins per item from this session's votes
    const winCounts = new Map<string, number>();
    for (const comp of session.comparisons) {
      if (comp.winnerId) {
        winCounts.set(comp.winnerId, (winCounts.get(comp.winnerId) || 0) + 1);
      }
    }

    // Get all items for the study
    const items = await prisma.item.findMany({
      where: { studyId },
      select: {
        id: true,
        categoryId: true,
        imageKey: true,
        externalId: true,
      },
    });

    // Calculate rankings per category
    const categoryRankings = await Promise.all(
      session.study.categories.map(async (category) => {
        const categoryItems = items.filter((item) => item.categoryId === category.id);

        // Sort by win count from this session (descending)
        const rankedItems = categoryItems
          .map((item) => ({
            id: item.id,
            externalId: item.externalId,
            imageUrl: buildImageUrl(item.imageKey),
            wins: winCounts.get(item.id) || 0,
          }))
          .sort((a, b) => b.wins - a.wins)
          .slice(0, 10); // Top 10 (expandable from 4)

        return {
          categoryId: category.id,
          categoryName: category.name,
          topItems: rankedItems,
        };
      })
    );

    return NextResponse.json({
      rankings: categoryRankings,
      totalVotes: session.comparisons.length,
    });
  } catch (error) {
    console.error('Personal rankings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
