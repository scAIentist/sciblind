/**
 * UI Config API
 *
 * PATCH /api/admin/studies/[studyId]/ui-config
 *
 * Updates the UI customization settings for a study.
 * These settings control the participant voting experience appearance.
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
