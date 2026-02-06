/**
 * PDF Export API
 *
 * GET /api/admin/studies/[studyId]/export-pdf
 *
 * Generates a comprehensive PDF report with:
 * - Rankings with visual representation
 * - Methodology section
 * - Full audit report
 * - Certificate of completion
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/logging';
import PDFDocument from 'pdfkit';

const ALGO_VERSION = 'sciblind-v2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');

    // Get study with all data
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
      orderBy: { eloRating: 'desc' },
    });

    // Get comparisons (non-test)
    const comparisons = await prisma.comparison.findMany({
      where: {
        studyId,
        ...(categoryId ? { categoryId } : {}),
        OR: [
          { isFlagged: false },
          { flagReason: { not: 'test_session' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get sessions
    const sessions = await prisma.session.findMany({
      where: {
        studyId,
        isTestSession: false,
      },
      select: {
        id: true,
        createdAt: true,
        isCompleted: true,
        comparisonCount: true,
        avgResponseTimeMs: true,
      },
    });

    // Create PDF
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `SciBLIND Report - ${study.title}`,
        Author: 'SciBLIND Platform',
        Subject: 'Blind Pairwise Comparison Study Results',
        CreationDate: new Date(),
      },
    });

    // Collect PDF chunks
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    // ========== PAGE 1: COVER / CERTIFICATE ==========
    doc.fontSize(24).font('Helvetica-Bold');
    doc.text('CERTIFICATE OF COMPLETION', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).font('Helvetica');
    doc.text('This certifies that the following blind pairwise comparison study', { align: 'center' });
    doc.text('has been completed according to scientific methodology:', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(20).font('Helvetica-Bold');
    doc.text(study.title, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica');
    doc.text(`Study ID: ${study.id}`, { align: 'center' });
    doc.text(`Algorithm Version: ${ALGO_VERSION}`, { align: 'center' });
    doc.moveDown(2);

    // Summary stats box
    doc.rect(100, doc.y, 400, 120).stroke();
    const statsY = doc.y + 15;
    doc.fontSize(11);
    doc.text(`Total Comparisons: ${comparisons.length}`, 120, statsY);
    doc.text(`Total Items Evaluated: ${items.length}`, 120, statsY + 20);
    doc.text(`Completed Sessions: ${sessions.filter(s => s.isCompleted).length}`, 120, statsY + 40);
    doc.text(`Categories: ${study.categories.length > 0 ? study.categories.map(c => c.name).join(', ') : 'None'}`, 120, statsY + 60);
    doc.text(`Export Date: ${new Date().toLocaleDateString('sl-SI')}`, 120, statsY + 80);

    doc.moveDown(8);

    // Signature line
    doc.moveTo(150, doc.y).lineTo(450, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(10).text('SciBLIND Platform - Automated Scientific Ranking', { align: 'center' });

    // ========== PAGE 2: METHODOLOGY ==========
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold');
    doc.text('METHODOLOGY', { underline: true });
    doc.moveDown(1);

    doc.fontSize(11).font('Helvetica');

    // Default methodology if not provided
    const methodology = study.methodologyText || `
This study employed the ELO rating system (K-factor: ${study.eloKFactor}) to rank items through blind pairwise comparisons. Participants were shown two items at a time in randomized positions and asked to select their preference.

Key parameters:
• Ranking Method: ${study.rankingMethod}
• Initial ELO Rating: ${study.eloInitialRating}
• K-Factor: ${study.eloKFactor} ${study.adaptiveKFactor ? '(adaptive)' : '(fixed)'}
• Minimum Exposures Per Item: ${study.minExposuresPerItem}

The blind comparison methodology ensures:
1. No position bias (left/right randomization tracked)
2. No ordering effects (pair selection is randomized)
3. No identification bias (items are anonymous)
4. Statistical reliability through minimum exposure thresholds

Quality Controls:
• Response times are tracked and flagged if too fast (<500ms) or too slow (>5min)
• Duplicate comparisons within a session are prevented
• Test sessions are excluded from final rankings
`.trim();

    doc.text(methodology, {
      align: 'justify',
      lineGap: 4,
    });

    // ========== PAGE 3+: RANKINGS BY CATEGORY ==========
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold');
    doc.text('RANKINGS', { underline: true });
    doc.moveDown(1);

    const categoriesToShow = study.hasCategorySeparation && study.categories.length > 0
      ? study.categories
      : [{ id: null, name: 'All Items', slug: 'all' }];

    for (const category of categoriesToShow) {
      if (doc.y > 700) doc.addPage();

      const categoryItems = category.id
        ? items.filter(i => i.categoryId === category.id)
        : items;

      if (categoryItems.length === 0) continue;

      doc.fontSize(14).font('Helvetica-Bold');
      doc.text(category.name, { underline: false });
      doc.moveDown(0.5);

      // Table header
      doc.fontSize(9).font('Helvetica-Bold');
      const tableTop = doc.y;
      const col1 = 50;  // Rank
      const col2 = 80;  // External ID
      const col3 = 150; // Label
      const col4 = 280; // ELO
      const col5 = 340; // Games
      const col6 = 400; // Win Rate
      const col7 = 470; // Position Bias

      doc.text('Rank', col1, tableTop);
      doc.text('ID', col2, tableTop);
      doc.text('Label', col3, tableTop);
      doc.text('ELO', col4, tableTop);
      doc.text('Games', col5, tableTop);
      doc.text('Win %', col6, tableTop);
      doc.text('Pos Bias', col7, tableTop);

      doc.moveTo(col1, tableTop + 12).lineTo(530, tableTop + 12).stroke();

      doc.font('Helvetica');
      let rowY = tableTop + 18;

      categoryItems
        .sort((a, b) => b.eloRating - a.eloRating)
        .slice(0, 50) // Limit to top 50 per category
        .forEach((item, idx) => {
          if (rowY > 750) {
            doc.addPage();
            rowY = 50;
          }

          const winRate = item.comparisonCount > 0
            ? Math.round((item.winCount / item.comparisonCount) * 100)
            : 0;
          const posBias = item.comparisonCount > 0
            ? Math.round(((item.leftCount - item.rightCount) / item.comparisonCount) * 100)
            : 0;

          doc.text(`${idx + 1}`, col1, rowY);
          doc.text(item.externalId || '-', col2, rowY);
          doc.text((item.label || '-').substring(0, 20), col3, rowY);
          doc.text(Math.round(item.eloRating).toString(), col4, rowY);
          doc.text(item.eloGames.toString(), col5, rowY);
          doc.text(`${winRate}%`, col6, rowY);
          doc.text(`${posBias > 0 ? '+' : ''}${posBias}%`, col7, rowY);

          rowY += 14;
        });

      doc.moveDown(2);
    }

    // ========== AUDIT SECTION ==========
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold');
    doc.text('AUDIT TRAIL', { underline: true });
    doc.moveDown(1);

    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Comparisons Recorded: ${comparisons.length}`);
    doc.text(`Date Range: ${comparisons.length > 0
      ? `${comparisons[0].createdAt.toLocaleDateString('sl-SI')} - ${comparisons[comparisons.length - 1].createdAt.toLocaleDateString('sl-SI')}`
      : 'N/A'
    }`);
    doc.text(`Unique Sessions: ${sessions.length}`);
    doc.text(`Flagged Comparisons: ${comparisons.filter(c => c.isFlagged).length}`);
    doc.moveDown(1);

    // Response time distribution
    const responseTimes = comparisons
      .map(c => c.responseTimeMs)
      .filter((t): t is number => t !== null);

    if (responseTimes.length > 0) {
      const avgTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
      const medianTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)];

      doc.text(`Average Response Time: ${avgTime}ms`);
      doc.text(`Median Response Time: ${medianTime}ms`);
    }

    doc.moveDown(1);

    // Position balance check
    let totalLeft = 0;
    let totalRight = 0;
    for (const comp of comparisons) {
      if (comp.winnerId === comp.leftItemId) totalLeft++;
      else totalRight++;
    }
    const positionBias = comparisons.length > 0
      ? Math.round(((totalLeft - totalRight) / comparisons.length) * 100)
      : 0;

    doc.text(`Position Balance: ${totalLeft} left wins, ${totalRight} right wins (${positionBias > 0 ? '+' : ''}${positionBias}% bias)`);
    doc.moveDown(1);

    // Data integrity note
    doc.fontSize(10).font('Helvetica-Oblique');
    doc.text('Note: This audit trail represents all non-test comparisons. Test sessions are excluded from rankings and statistics. Full comparison data is available in JSON/Excel export format.', {
      align: 'justify',
    });

    // ========== FOOTER ON EACH PAGE ==========
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica');
      doc.text(
        `SciBLIND Report - ${study.title} | Page ${i + 1} of ${pageCount}`,
        50,
        780,
        { align: 'center', width: 500 }
      );
    }

    // Finalize PDF
    doc.end();

    // Wait for PDF to finish
    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    logActivity('EXPORT_DOWNLOADED', {
      studyId,
      detail: `PDF report downloaded (${comparisons.length} comparisons, ${items.length} items)`,
      metadata: { categoryId: categoryId || null, format: 'pdf' },
    });

    const filename = `sciblind-report-${study.id}-${new Date().toISOString().split('T')[0]}.pdf`;

    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
