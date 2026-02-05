/**
 * Category Thumbnails API
 *
 * GET /api/participate/[studyId]/category-thumbnails
 *
 * Returns a small random sample of image keys per category for gallery preview.
 * Only returns imageKey — no IDs, labels, or other identifying data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isValidCuid } from '@/lib/security/validation';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/security/rate-limit';

const THUMBNAILS_PER_CATEGORY = 6;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;

    if (!isValidCuid(studyId)) {
      return NextResponse.json(
        { error: 'Invalid study ID format' },
        { status: 400 }
      );
    }

    // Rate limit by IP (forwarded for) or fallback to study ID
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || studyId;
    const rateLimit = checkRateLimit(clientIp, RATE_LIMITS.general);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const study = await prisma.study.findUnique({
      where: { id: studyId },
      include: {
        categories: {
          orderBy: { displayOrder: 'asc' },
          include: {
            items: {
              where: { imageKey: { not: null } },
              select: { imageKey: true },
            },
          },
        },
      },
    });

    if (!study || !study.isActive) {
      return NextResponse.json(
        { error: 'Study not found' },
        { status: 404 }
      );
    }

    // Pick random sample of imageKeys per category
    const categories: Record<string, string[]> = {};

    for (const cat of study.categories) {
      const allKeys = cat.items
        .map((item) => item.imageKey)
        .filter((key): key is string => key !== null);

      // Shuffle and take first N
      const shuffled = allKeys.sort(() => Math.random() - 0.5);
      categories[cat.id] = shuffled.slice(0, THUMBNAILS_PER_CATEGORY);
    }

    return NextResponse.json(
      { categories },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      }
    );
  } catch (error) {
    console.error('Category thumbnails error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
