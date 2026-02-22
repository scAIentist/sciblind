/**
 * PDF Export API
 *
 * GET /api/admin/studies/[studyId]/export-pdf
 *
 * Generates a configurable PDF report with image compression.
 * Query params:
 *   - winnersPerCategory: 4, 8, or 12 (default: 4)
 *   - imageQuality: 1-100 (default: 80)
 *   - includeCover: true/false
 *   - includeWinners: true/false
 *   - includeVotingProcess: true/false
 *   - includeEloExplanation: true/false
 *   - includeFullRankings: true/false
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/logging';
import { generateStudyReport, ReportConfig } from '@/lib/pdf/report-generator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const searchParams = request.nextUrl.searchParams;

    // Parse config from query params
    const config: Partial<ReportConfig> = {};

    // Section toggles
    if (searchParams.has('includeCover')) {
      config.includeCover = searchParams.get('includeCover') === 'true';
    }
    if (searchParams.has('includeWinners')) {
      config.includeWinners = searchParams.get('includeWinners') === 'true';
    }
    if (searchParams.has('includeVotingProcess')) {
      config.includeVotingProcess = searchParams.get('includeVotingProcess') === 'true';
    }
    if (searchParams.has('includeEloExplanation')) {
      config.includeEloExplanation = searchParams.get('includeEloExplanation') === 'true';
    }
    if (searchParams.has('includeFullRankings')) {
      config.includeFullRankings = searchParams.get('includeFullRankings') === 'true';
    }

    // Visual options
    if (searchParams.has('winnersPerCategory')) {
      const n = parseInt(searchParams.get('winnersPerCategory') || '4', 10);
      config.winnersPerCategory = [4, 8, 12].includes(n) ? n : 4;
    }
    if (searchParams.has('imageQuality')) {
      const q = parseInt(searchParams.get('imageQuality') || '80', 10);
      config.imageQuality = Math.max(1, Math.min(100, q));
    }
    if (searchParams.has('showArtistRank')) {
      config.showArtistRank = searchParams.get('showArtistRank') === 'true';
    }
    if (searchParams.has('showInitialElo')) {
      config.showInitialElo = searchParams.get('showInitialElo') === 'true';
    }

    // Branding
    if (searchParams.has('primaryColor')) {
      config.primaryColor = searchParams.get('primaryColor') || undefined;
    }
    if (searchParams.has('secondaryColor')) {
      config.secondaryColor = searchParams.get('secondaryColor') || undefined;
    }
    if (searchParams.has('accentColor')) {
      config.accentColor = searchParams.get('accentColor') || undefined;
    }

    // Text customization
    if (searchParams.has('title')) {
      config.title = searchParams.get('title') || undefined;
    }
    if (searchParams.has('subtitle')) {
      config.subtitle = searchParams.get('subtitle') || undefined;
    }
    if (searchParams.has('footerText')) {
      config.footerText = searchParams.get('footerText') || undefined;
    }

    // Check study exists
    const study = await prisma.study.findUnique({
      where: { id: studyId },
      select: { id: true, title: true },
    });

    if (!study) {
      return NextResponse.json(
        { error: 'Study not found', errorKey: 'STUDY_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Generate PDF with image compression
    const buffer = await generateStudyReport(prisma, studyId, config);

    logActivity('EXPORT_DOWNLOADED', {
      studyId,
      detail: `PDF report downloaded (${(buffer.length / 1024).toFixed(0)} KB)`,
      metadata: { format: 'pdf', version: 'v3-compressed', config },
    });

    const filename = `${study.title.replace(/[^a-zA-Z0-9-]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: 'Internal server error', errorKey: 'SERVER_ERROR', details: String(error) },
      { status: 500 }
    );
  }
}
