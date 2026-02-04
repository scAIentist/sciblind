/**
 * Study API
 *
 * GET /api/studies/[studyId]
 *
 * Returns study details (public endpoint for participants)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;

    const study = await prisma.study.findUnique({
      where: { id: studyId },
      select: {
        id: true,
        title: true,
        description: true,
        participantPrompt: true,
        inputType: true,
        language: true,
        logoUrls: true,
        requireAccessCode: true,
        showRankingsToParticipants: true,
        hasCategorySeparation: true,
        isActive: true,
        comparisonsPerParticipant: true,
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
            displayOrder: true,
          },
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

    return NextResponse.json(study);
  } catch (error) {
    console.error('Study fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
