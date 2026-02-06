/**
 * Audit Export API
 *
 * GET /api/admin/studies/[studyId]/export
 *
 * Returns all comparisons (non-test) as a comprehensive JSON or Excel export
 * suitable for external analysis and reproducibility.
 *
 * Query parameters:
 * - categoryId: Filter by category
 * - includeTest: Include test comparisons (default: false)
 * - format: "json" (default) | "xlsx" for Excel
 *
 * The export includes:
 * - Study configuration (algo version, K-factor, thresholds)
 * - Item metadata (externalId, label, category, initial ELO, artist rank)
 * - All comparison records with full audit trail
 * - Summary statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/logging';
import * as XLSX from 'xlsx';

const ALGO_VERSION = 'sciblind-v2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const includeTest = searchParams.get('includeTest') === 'true';
    const format = searchParams.get('format') || 'json';

    // Get study
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

    // Get all items
    const items = await prisma.item.findMany({
      where: {
        studyId,
        ...(categoryId ? { categoryId } : {}),
      },
      include: {
        category: true,
      },
      orderBy: [
        { categoryId: 'asc' },
        { externalId: 'asc' },
      ],
    });

    // Get comparisons
    const comparisons = await prisma.comparison.findMany({
      where: {
        studyId,
        ...(categoryId ? { categoryId } : {}),
        ...(includeTest ? {} : {
          OR: [
            { isFlagged: false },
            { flagReason: { not: 'test_session' } },
          ],
        }),
      },
      include: {
        session: {
          select: {
            id: true,
            isTestSession: true,
            ipHash: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get sessions summary
    const sessions = await prisma.session.findMany({
      where: { studyId },
      select: {
        id: true,
        createdAt: true,
        isTestSession: true,
        isCompleted: true,
        comparisonCount: true,
        avgResponseTimeMs: true,
        isFlagged: true,
        flagReason: true,
      },
    });

    // Format export
    const exportData = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      algoVersion: ALGO_VERSION,

      study: {
        id: study.id,
        title: study.title,
        description: study.description,
        inputType: study.inputType,
        rankingMethod: study.rankingMethod,
        eloKFactor: study.eloKFactor,
        eloInitialRating: study.eloInitialRating,
        minExposuresPerItem: study.minExposuresPerItem,
        minTotalComparisons: study.minTotalComparisons,
        adaptiveKFactor: study.adaptiveKFactor,
        hasCategorySeparation: study.hasCategorySeparation,
        language: study.language,
        createdAt: study.createdAt.toISOString(),
      },

      categories: study.categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        displayOrder: c.displayOrder,
      })),

      items: items.map((item) => ({
        id: item.id,
        externalId: item.externalId,
        label: item.label,
        categoryId: item.categoryId,
        categoryName: item.category?.name,
        artistRank: item.artistRank,
        artistEloBoost: item.artistEloBoost,
        eloRating: item.eloRating,
        eloGames: item.eloGames,
        comparisonCount: item.comparisonCount,
        winCount: item.winCount,
        lossCount: item.lossCount,
        leftCount: item.leftCount,
        rightCount: item.rightCount,
      })),

      comparisons: comparisons.map((c) => ({
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        sessionId: c.sessionId,
        categoryId: c.categoryId,
        itemAId: c.itemAId,
        itemBId: c.itemBId,
        winnerId: c.winnerId,
        leftItemId: c.leftItemId,
        rightItemId: c.rightItemId,
        responseTimeMs: c.responseTimeMs,
        isFlagged: c.isFlagged,
        flagReason: c.flagReason,
        algoVersion: c.algoVersion,
        isTestSession: c.session.isTestSession,
      })),

      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        isTestSession: s.isTestSession,
        isCompleted: s.isCompleted,
        comparisonCount: s.comparisonCount,
        avgResponseTimeMs: s.avgResponseTimeMs,
        isFlagged: s.isFlagged,
        flagReason: s.flagReason,
      })),

      summary: {
        totalItems: items.length,
        totalComparisons: comparisons.length,
        totalSessions: sessions.length,
        completedSessions: sessions.filter((s) => s.isCompleted).length,
        testSessions: sessions.filter((s) => s.isTestSession).length,
        flaggedComparisons: comparisons.filter((c) => c.isFlagged).length,
        categoriesCount: study.categories.length,
        selectedCategoryFilter: categoryId,
        includesTestData: includeTest,
      },
    };

    logActivity('EXPORT_DOWNLOADED', {
      studyId,
      detail: `Export downloaded (${comparisons.length} comparisons, ${sessions.length} sessions, format: ${format})`,
      metadata: { categoryId: categoryId || null, includeTest, format },
    });

    // Excel format
    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Rankings (items sorted by ELO)
      const rankingsData = items
        .sort((a, b) => b.eloRating - a.eloRating)
        .map((item, idx) => ({
          'Rank': idx + 1,
          'External ID': item.externalId || '',
          'Label': item.label || '',
          'Category': item.category?.name || '',
          'ELO Rating': Math.round(item.eloRating),
          'Games Played': item.eloGames,
          'Win Count': item.winCount,
          'Loss Count': item.lossCount,
          'Win Rate': item.comparisonCount > 0
            ? `${Math.round((item.winCount / item.comparisonCount) * 100)}%`
            : 'N/A',
          'Left Count': item.leftCount,
          'Right Count': item.rightCount,
          'Position Bias': item.comparisonCount > 0
            ? `${Math.round(((item.leftCount - item.rightCount) / item.comparisonCount) * 100)}%`
            : '0%',
        }));
      const rankingsSheet = XLSX.utils.json_to_sheet(rankingsData);
      XLSX.utils.book_append_sheet(workbook, rankingsSheet, 'Rankings');

      // Sheet 2: All Comparisons (audit trail)
      const comparisonsData = comparisons.map((c) => {
        const itemA = items.find((i) => i.id === c.itemAId);
        const itemB = items.find((i) => i.id === c.itemBId);
        const winner = items.find((i) => i.id === c.winnerId);
        return {
          'Comparison ID': c.id,
          'Timestamp': c.createdAt.toISOString(),
          'Session ID': c.sessionId,
          'Category': study.categories.find((cat) => cat.id === c.categoryId)?.name || '',
          'Item A (External ID)': itemA?.externalId || c.itemAId,
          'Item B (External ID)': itemB?.externalId || c.itemBId,
          'Winner (External ID)': winner?.externalId || c.winnerId,
          'Winner Position': c.winnerId === c.leftItemId ? 'Left' : 'Right',
          'Response Time (ms)': c.responseTimeMs || '',
          'Flagged': c.isFlagged ? 'Yes' : 'No',
          'Flag Reason': c.flagReason || '',
          'Test Session': c.session.isTestSession ? 'Yes' : 'No',
        };
      });
      const comparisonsSheet = XLSX.utils.json_to_sheet(comparisonsData);
      XLSX.utils.book_append_sheet(workbook, comparisonsSheet, 'Comparisons');

      // Sheet 3: Sessions
      const sessionsData = sessions.map((s) => ({
        'Session ID': s.id,
        'Started At': s.createdAt.toISOString(),
        'Test Session': s.isTestSession ? 'Yes' : 'No',
        'Completed': s.isCompleted ? 'Yes' : 'No',
        'Comparisons': s.comparisonCount,
        'Avg Response (ms)': s.avgResponseTimeMs || '',
        'Flagged': s.isFlagged ? 'Yes' : 'No',
        'Flag Reason': s.flagReason || '',
      }));
      const sessionsSheet = XLSX.utils.json_to_sheet(sessionsData);
      XLSX.utils.book_append_sheet(workbook, sessionsSheet, 'Sessions');

      // Sheet 4: Study Info
      const studyInfoData = [
        { 'Field': 'Study Title', 'Value': study.title },
        { 'Field': 'Study ID', 'Value': study.id },
        { 'Field': 'Description', 'Value': study.description },
        { 'Field': 'Ranking Method', 'Value': study.rankingMethod },
        { 'Field': 'ELO K-Factor', 'Value': study.eloKFactor },
        { 'Field': 'ELO Initial Rating', 'Value': study.eloInitialRating },
        { 'Field': 'Min Exposures Per Item', 'Value': study.minExposuresPerItem },
        { 'Field': 'Adaptive K-Factor', 'Value': study.adaptiveKFactor ? 'Yes' : 'No' },
        { 'Field': 'Categories', 'Value': study.categories.map((c) => c.name).join(', ') },
        { 'Field': 'Language', 'Value': study.language },
        { 'Field': 'Created At', 'Value': study.createdAt.toISOString() },
        { 'Field': 'Algorithm Version', 'Value': ALGO_VERSION },
        { 'Field': 'Export Date', 'Value': new Date().toISOString() },
        { 'Field': '', 'Value': '' },
        { 'Field': 'Summary', 'Value': '' },
        { 'Field': 'Total Items', 'Value': items.length },
        { 'Field': 'Total Comparisons', 'Value': comparisons.length },
        { 'Field': 'Total Sessions', 'Value': sessions.length },
        { 'Field': 'Completed Sessions', 'Value': sessions.filter((s) => s.isCompleted).length },
        { 'Field': 'Test Sessions', 'Value': sessions.filter((s) => s.isTestSession).length },
        { 'Field': 'Flagged Comparisons', 'Value': comparisons.filter((c) => c.isFlagged).length },
      ];
      const studyInfoSheet = XLSX.utils.json_to_sheet(studyInfoData);
      XLSX.utils.book_append_sheet(workbook, studyInfoSheet, 'Study Info');

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const filename = `sciblind-export-${study.id}-${new Date().toISOString().split('T')[0]}.xlsx`;

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Default: JSON format
    const filename = `sciblind-export-${study.id}-${new Date().toISOString().split('T')[0]}.json`;

    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
