/**
 * Generate IzVRS PDF Report Locally
 *
 * Usage: npx tsx scripts/generate-izvrs-pdf.ts
 *
 * This script uses the report generator service with Sharp image compression
 * to produce a reasonably-sized PDF (should be ~1-5MB instead of 139MB).
 */

import { PrismaClient } from '@prisma/client';
import { ReportGenerator, ReportConfig, DEFAULT_REPORT_CONFIG } from '../src/lib/pdf/report-generator';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const studyId = 'cml808mzc0000m104un333c69';

  console.log('Fetching study data...');
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    include: { categories: { orderBy: { displayOrder: 'asc' } } },
  });

  if (!study) {
    console.error('Study not found');
    return;
  }

  const items = await prisma.item.findMany({
    where: { studyId },
    include: { category: true },
    orderBy: { eloRating: 'desc' },
  });

  const comparisons = await prisma.comparison.findMany({
    where: {
      studyId,
      OR: [
        { flagReason: null },
        { flagReason: { not: 'test_session' } },
      ],
    },
  });

  const sessions = await prisma.session.findMany({
    where: { studyId, isTestSession: false },
    include: { accessCode: { select: { label: true, code: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log('Study:', study.title);
  console.log('Items:', items.length);
  console.log('Comparisons:', comparisons.length);
  console.log('Sessions:', sessions.length);

  // IzVRS-specific configuration
  const config: Partial<ReportConfig> = {
    // All sections enabled
    includeCover: true,
    includeWinners: true,
    includeVotingProcess: true,
    includeEloExplanation: true,
    includeFullRankings: true,

    // Visual options
    winnersPerCategory: 4,
    showArtistRank: true,
    showInitialElo: true,

    // IzVRS CGP branding colors
    primaryColor: '#436334',   // Green dark
    secondaryColor: '#0a8fa5', // Teal dark
    accentColor: '#d3a218',    // Gold dark

    // IzVRS text
    title: 'REZULTATI GLASOVANJA',
    subtitle: 'Likovni natečaj IzVRS 2025',
    footerText: 'IzVRS & Izvrstna | SciBLIND',

    // Image quality (80 is a good balance of quality vs size)
    imageQuality: 80,
  };

  console.log('\nGenerating PDF with Sharp compression...');
  console.log(`Image quality: ${config.imageQuality}%`);

  const generator = new ReportGenerator(
    { study, items, comparisons, sessions },
    config
  );

  const startTime = Date.now();
  const buffer = await generator.generate();
  const duration = Date.now() - startTime;

  const outputPath = path.join(process.cwd(), 'IzVRS-Rezultati-Glasovanja-compressed.pdf');
  fs.writeFileSync(outputPath, buffer);

  const sizeKB = buffer.length / 1024;
  const sizeMB = sizeKB / 1024;

  console.log('\n✓ PDF generated successfully!');
  console.log(`  Path: ${outputPath}`);
  console.log(`  Size: ${sizeMB.toFixed(2)} MB (${sizeKB.toFixed(0)} KB)`);
  console.log(`  Time: ${(duration / 1000).toFixed(1)}s`);

  if (sizeMB > 10) {
    console.log('\n⚠ Warning: PDF is larger than 10MB. Consider:');
    console.log('  - Lowering imageQuality (try 60-70)');
    console.log('  - Source images may be very large');
  } else {
    console.log('\n✓ File size is reasonable for email/download');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
