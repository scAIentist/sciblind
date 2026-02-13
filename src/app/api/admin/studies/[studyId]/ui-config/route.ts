/**
 * Study Config API
 *
 * PATCH /api/admin/studies/[studyId]/ui-config
 *
 * Updates the UI customization and behavioral settings for a study.
 * These settings control the participant voting experience.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/logging';

const VALID_LOGO_POSITIONS = ['top-center', 'top-left', 'hidden'];
const VALID_PROGRESS_STYLES = ['dots', 'bar', 'hidden'];
const VALID_VOTE_ANIMATIONS = ['thumbs-up', 'checkmark', 'border-only', 'none'];
const VALID_CATEGORY_STYLES = ['gallery', 'list', 'cards'];
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const body = await request.json();

    // Validate study exists
    const study = await prisma.study.findUnique({
      where: { id: studyId },
      select: { id: true },
    });

    if (!study) {
      return NextResponse.json(
        { error: 'Study not found' },
        { status: 404 }
      );
    }

    // Build update data with validation
    const updateData: Record<string, unknown> = {};

    if (body.uiThemeColor !== undefined) {
      if (typeof body.uiThemeColor !== 'string' || !HEX_COLOR_REGEX.test(body.uiThemeColor)) {
        return NextResponse.json(
          { error: 'Invalid theme color. Must be hex format like #2563EB' },
          { status: 400 }
        );
      }
      updateData.uiThemeColor = body.uiThemeColor;
    }

    if (body.uiLogoPosition !== undefined) {
      if (!VALID_LOGO_POSITIONS.includes(body.uiLogoPosition)) {
        return NextResponse.json(
          { error: `Invalid logo position. Must be one of: ${VALID_LOGO_POSITIONS.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.uiLogoPosition = body.uiLogoPosition;
    }

    if (body.uiProgressStyle !== undefined) {
      if (!VALID_PROGRESS_STYLES.includes(body.uiProgressStyle)) {
        return NextResponse.json(
          { error: `Invalid progress style. Must be one of: ${VALID_PROGRESS_STYLES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.uiProgressStyle = body.uiProgressStyle;
    }

    if (body.uiVoteAnimation !== undefined) {
      if (!VALID_VOTE_ANIMATIONS.includes(body.uiVoteAnimation)) {
        return NextResponse.json(
          { error: `Invalid vote animation. Must be one of: ${VALID_VOTE_ANIMATIONS.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.uiVoteAnimation = body.uiVoteAnimation;
    }

    if (body.uiCategoryStyle !== undefined) {
      if (!VALID_CATEGORY_STYLES.includes(body.uiCategoryStyle)) {
        return NextResponse.json(
          { error: `Invalid category style. Must be one of: ${VALID_CATEGORY_STYLES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.uiCategoryStyle = body.uiCategoryStyle;
    }

    if (body.uiShowCounts !== undefined) {
      updateData.uiShowCounts = Boolean(body.uiShowCounts);
    }

    // Behavioral settings
    if (body.allowContinuedVoting !== undefined) {
      updateData.allowContinuedVoting = Boolean(body.allowContinuedVoting);
    }

    // Fraud detection settings
    if (body.minResponseTimeMs !== undefined) {
      const value = parseInt(body.minResponseTimeMs, 10);
      if (isNaN(value) || value < 0 || value > 60000) {
        return NextResponse.json(
          { error: 'Invalid minResponseTimeMs. Must be between 0 and 60000 (1 minute)' },
          { status: 400 }
        );
      }
      updateData.minResponseTimeMs = value;
    }

    if (body.maxResponseTimeMs !== undefined) {
      const value = parseInt(body.maxResponseTimeMs, 10);
      if (isNaN(value) || value < 10000 || value > 3600000) {
        return NextResponse.json(
          { error: 'Invalid maxResponseTimeMs. Must be between 10000 (10 seconds) and 3600000 (1 hour)' },
          { status: 400 }
        );
      }
      updateData.maxResponseTimeMs = value;
    }

    if (body.excludeFlaggedFromElo !== undefined) {
      updateData.excludeFlaggedFromElo = Boolean(body.excludeFlaggedFromElo);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update study
    const updated = await prisma.study.update({
      where: { id: studyId },
      data: updateData,
      select: {
        id: true,
        uiThemeColor: true,
        uiLogoPosition: true,
        uiProgressStyle: true,
        uiShowCounts: true,
        uiVoteAnimation: true,
        uiCategoryStyle: true,
        allowContinuedVoting: true,
        minResponseTimeMs: true,
        maxResponseTimeMs: true,
        excludeFlaggedFromElo: true,
      },
    });

    logActivity('STUDY_UPDATED', {
      studyId,
      detail: `UI config updated: ${Object.keys(updateData).join(', ')}`,
      metadata: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('UI config update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
