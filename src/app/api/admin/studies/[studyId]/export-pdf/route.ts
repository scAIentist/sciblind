/**
 * PDF Export API
 *
 * GET /api/admin/studies/[studyId]/export-pdf
 *
 * Generates a comprehensive PDF report with:
 * - Executive summary with TOP 12 winners per category
 * - Rankings with visual representation
 * - Artist ranking comparison
 * - Statistical reliability metrics
 * - Methodology section
 * - Full audit report
 * - Certificate of completion
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/logging';
import PDFDocument from 'pdfkit';

const ALGO_VERSION = 'sciblind-v2-quad';
const SUPABASE_STORAGE_URL = 'https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images';

// Helper to fetch image as buffer
async function fetchImageBuffer(imageKey: string): Promise<Buffer | null> {
  try {
    const url = `${SUPABASE_STORAGE_URL}/${imageKey}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const includeImages = searchParams.get('images') !== 'false'; // Default to true

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

    // Get all items with category
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

    // Get comparisons (non-test only)
    const comparisons = await prisma.comparison.findMany({
      where: {
        studyId,
        ...(categoryId ? { categoryId } : {}),
        OR: [
          { flagReason: null },
          { flagReason: { not: 'test_session' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get sessions (non-test)
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

    // Calculate per-category stats
    const categoryStats = study.categories.map(cat => {
      const catItems = items.filter(i => i.categoryId === cat.id);
      const catComparisons = comparisons.filter(c => c.categoryId === cat.id);
      const sortedItems = [...catItems].sort((a, b) => b.eloRating - a.eloRating);
      const top12 = sortedItems.slice(0, 12);

      // Calculate average comparisons per item
      const avgComparisonsPerItem = catItems.length > 0
        ? catItems.reduce((sum, item) => sum + item.comparisonCount, 0) / catItems.length
        : 0;

      return {
        category: cat,
        items: catItems,
        comparisons: catComparisons,
        top12,
        avgComparisonsPerItem,
      };
    });

    // Create PDF
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 60, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `Rezultati glasovanja - ${study.title}`,
        Author: 'SciBLIND Platform',
        Subject: 'Rezultati slepega glasovanja za likovni natečaj',
        CreationDate: new Date(),
      },
    });

    // Collect PDF chunks
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    // ========== PAGE 1: COVER ==========
    doc.fontSize(28).font('Helvetica-Bold');
    doc.text('REZULTATI GLASOVANJA', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(16).font('Helvetica');
    doc.text('Slepo primerjalno ocenjevanje likovnih del', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(22).font('Helvetica-Bold');
    doc.text(study.title, { align: 'center' });
    doc.moveDown(2);

    // Summary box
    const boxY = doc.y;
    doc.rect(80, boxY, 435, 140).fillAndStroke('#f8fafc', '#e2e8f0');

    doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold');
    doc.text('POVZETEK ŠTUDIJE', 100, boxY + 15);

    doc.fontSize(11).font('Helvetica').fillColor('#475569');
    const summaryY = boxY + 40;
    doc.text(`Število ocenjevalcev: ${sessions.length}`, 100, summaryY);
    doc.text(`Skupno primerjav: ${comparisons.length}`, 100, summaryY + 18);
    doc.text(`Ocenjenih del: ${items.length}`, 100, summaryY + 36);
    doc.text(`Kategorije: ${study.categories.map(c => c.name).join(', ')}`, 100, summaryY + 54);
    doc.text(`Način primerjave: Kvadruplet (4 slike, izberi najboljšo)`, 100, summaryY + 72);
    doc.text(`Datum izvoza: ${new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })}`, 100, summaryY + 90);

    doc.y = boxY + 160;
    doc.moveDown(2);

    // Quick results preview
    doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold');
    doc.text('IZBRANI ZMAGOVALCI (TOP 4 NA KATEGORIJO)', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(10).font('Helvetica').fillColor('#64748b');
    for (const catStat of categoryStats) {
      const top4Ids = catStat.top12.slice(0, 4).map(item => `#${item.externalId}`).join(', ');
      doc.text(`${catStat.category.name}: ${top4Ids}`, { align: 'center' });
    }

    doc.moveDown(3);

    // Footer info
    doc.fontSize(9).fillColor('#94a3b8');
    doc.text(`Algoritem: ${ALGO_VERSION} | ID študije: ${study.id.slice(-12)}`, { align: 'center' });
    doc.text('Generirano s platformo SciBLIND - blind.scaientist.eu', { align: 'center' });

    // ========== PAGE 2: EXECUTIVE SUMMARY - TOP 12 PER CATEGORY ==========
    doc.addPage();
    doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold');
    doc.text('ZMAGOVALCI PO KATEGORIJAH', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica').fillColor('#64748b');
    doc.text('Top 12 likovnih del v vsaki kategoriji, razvrščenih po ELO oceni glasovanja', { align: 'center' });
    doc.moveDown(1.5);

    for (const catStat of categoryStats) {
      if (doc.y > 650) doc.addPage();

      // Category header
      doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold');
      doc.text(catStat.category.name.toUpperCase(), 50);
      doc.fontSize(10).font('Helvetica').fillColor('#64748b');
      doc.text(`${catStat.items.length} del | ${catStat.comparisons.length} primerjav | Povprečno ${catStat.avgComparisonsPerItem.toFixed(1)} primerjav/delo`);
      doc.moveDown(0.5);

      // Top 12 table
      const tableTop = doc.y;
      const colRank = 50;
      const colId = 85;
      const colElo = 140;
      const colWins = 200;
      const colWinRate = 260;
      const colArtist = 330;
      const colMatch = 400;

      // Header row
      doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold');
      doc.text('#', colRank, tableTop);
      doc.text('ID', colId, tableTop);
      doc.text('ELO', colElo, tableTop);
      doc.text('Zmage', colWins, tableTop);
      doc.text('Uspešnost', colWinRate, tableTop);
      doc.text('Umetnica', colArtist, tableTop);
      doc.text('Ujemanje', colMatch, tableTop);

      doc.moveTo(colRank, tableTop + 14).lineTo(480, tableTop + 14).strokeColor('#e2e8f0').stroke();

      doc.font('Helvetica').fillColor('#1e293b');
      let rowY = tableTop + 20;

      catStat.top12.forEach((item, idx) => {
        const winRate = item.comparisonCount > 0
          ? Math.round((item.winCount / item.comparisonCount) * 100)
          : 0;

        // Check if artist also ranked this in top 12
        const artistInTop12 = item.artistRank !== null && item.artistRank <= 12;
        const matchIndicator = artistInTop12 ? '✓' : '';

        // Highlight top 4 with gold/silver/bronze/blue
        if (idx < 4) {
          const colors = ['#fef3c7', '#f1f5f9', '#fed7aa', '#dbeafe'];
          doc.rect(colRank - 5, rowY - 3, 440, 14).fill(colors[idx]);
          doc.fillColor('#1e293b');
        }

        doc.fontSize(9);
        doc.text(`${idx + 1}`, colRank, rowY);
        doc.font('Helvetica-Bold').text(`${item.externalId}`, colId, rowY);
        doc.font('Helvetica').text(`${Math.round(item.eloRating)}`, colElo, rowY);
        doc.text(`${item.winCount}/${item.comparisonCount}`, colWins, rowY);
        doc.text(`${winRate}%`, colWinRate, rowY);
        doc.text(item.artistRank ? `#${item.artistRank}` : '-', colArtist, rowY);
        doc.fillColor(artistInTop12 ? '#16a34a' : '#94a3b8').text(matchIndicator, colMatch, rowY);
        doc.fillColor('#1e293b');

        rowY += 16;
      });

      doc.y = rowY + 10;
      doc.moveDown(1);
    }

    // ========== PAGE 3: ARTIST COMPARISON ==========
    doc.addPage();
    doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold');
    doc.text('PRIMERJAVA Z OCENO UMETNICE', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica').fillColor('#64748b');
    doc.text('Primerjava med oceno glasovanja in oceno strokovne umetnice', { align: 'center' });
    doc.moveDown(1.5);

    for (const catStat of categoryStats) {
      if (doc.y > 600) doc.addPage();

      doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold');
      doc.text(catStat.category.name.toUpperCase(), 50);
      doc.moveDown(0.5);

      // Calculate correlation metrics
      const itemsWithArtistRank = catStat.items.filter(i => i.artistRank !== null);
      const sortedByElo = [...itemsWithArtistRank].sort((a, b) => b.eloRating - a.eloRating);

      let matchCount = 0;
      let top12MatchCount = 0;

      sortedByElo.forEach((item, idx) => {
        const eloRank = idx + 1;
        const artistRank = item.artistRank!;
        if (eloRank <= 12 && artistRank <= 12) top12MatchCount++;
        if (Math.abs(eloRank - artistRank) <= 5) matchCount++;
      });

      const matchPercentage = itemsWithArtistRank.length > 0
        ? Math.round((matchCount / itemsWithArtistRank.length) * 100)
        : 0;
      const top12MatchPercentage = Math.round((top12MatchCount / 12) * 100);

      doc.fontSize(10).font('Helvetica').fillColor('#475569');
      doc.text(`Ujemanje v Top 12: ${top12MatchCount}/12 (${top12MatchPercentage}%)`, 50);
      doc.text(`Dela z razliko ≤5 mest: ${matchCount}/${itemsWithArtistRank.length} (${matchPercentage}%)`, 50);
      doc.moveDown(0.5);

      // Show disagreements (items where crowd and artist differ significantly)
      const bigDisagreements = sortedByElo
        .map((item, idx) => ({
          item,
          eloRank: idx + 1,
          artistRank: item.artistRank!,
          diff: Math.abs((idx + 1) - item.artistRank!),
        }))
        .filter(d => d.diff >= 10)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 5);

      if (bigDisagreements.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#dc2626');
        doc.text('Največja neskladja (razlika ≥10 mest):', 50);
        doc.font('Helvetica').fillColor('#475569');

        for (const d of bigDisagreements) {
          const direction = d.eloRank < d.artistRank ? '↑' : '↓';
          doc.text(`  #${d.item.externalId}: Glasovanje #${d.eloRank}, Umetnica #${d.artistRank} (${direction}${d.diff})`, 50);
        }
      }

      doc.moveDown(1.5);
    }

    // ========== PAGE 4: STATISTICAL RELIABILITY ==========
    doc.addPage();
    doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold');
    doc.text('STATISTIČNA ZANESLJIVOST', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica').fillColor('#64748b');
    doc.text('Metrike za oceno zanesljivosti in veljavnosti rezultatov', { align: 'center' });
    doc.moveDown(1.5);

    // Overall metrics
    doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold');
    doc.text('SPLOŠNE METRIKE', 50);
    doc.moveDown(0.5);

    const totalComparisons = comparisons.length;
    const avgComparisonsPerItem = items.length > 0
      ? totalComparisons / items.length
      : 0;

    // Response time analysis
    const responseTimes = comparisons
      .map(c => c.responseTimeMs)
      .filter((t): t is number => t !== null && t > 0);

    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
    const medianResponseTime = responseTimes.length > 0
      ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)]
      : 0;

    // Flagged analysis
    const flaggedComparisons = comparisons.filter(c => c.isFlagged && c.flagReason !== 'test_session');
    const tooFastCount = flaggedComparisons.filter(c => c.flagReason === 'too_fast').length;
    const tooSlowCount = flaggedComparisons.filter(c => c.flagReason === 'too_slow').length;

    // Position bias
    let leftWins = 0;
    let rightWins = 0;
    for (const comp of comparisons) {
      if (comp.winnerId === comp.leftItemId) leftWins++;
      else rightWins++;
    }
    const positionBias = comparisons.length > 0
      ? ((leftWins - rightWins) / comparisons.length) * 100
      : 0;

    doc.fontSize(11).font('Helvetica').fillColor('#1e293b');

    const metricsBoxY = doc.y;
    doc.rect(50, metricsBoxY, 495, 180).fillAndStroke('#f8fafc', '#e2e8f0');

    doc.fillColor('#1e293b');
    let metricY = metricsBoxY + 15;
    const metricCol1 = 70;
    const metricCol2 = 300;

    const metrics = [
      ['Skupno primerjav', totalComparisons.toString()],
      ['Povprečno primerjav na delo', avgComparisonsPerItem.toFixed(1)],
      ['Število ocenjevalcev', sessions.length.toString()],
      ['Povprečen odzivni čas', `${(avgResponseTime / 1000).toFixed(1)} s`],
      ['Medianski odzivni čas', `${(medianResponseTime / 1000).toFixed(1)} s`],
      ['Označenih kot sumljivih', `${flaggedComparisons.length} (${(flaggedComparisons.length / totalComparisons * 100).toFixed(1)}%)`],
      ['  - Prehitri odzivi (<500ms)', tooFastCount.toString()],
      ['  - Prepočasni odzivi (>5min)', tooSlowCount.toString()],
      ['Pozicijska pristranskost', `${positionBias > 0 ? '+' : ''}${positionBias.toFixed(1)}% (L:${leftWins}, D:${rightWins})`],
    ];

    doc.fontSize(10);
    for (const [label, value] of metrics) {
      doc.font('Helvetica').text(label, metricCol1, metricY);
      doc.font('Helvetica-Bold').text(value, metricCol2, metricY);
      metricY += 18;
    }

    doc.y = metricsBoxY + 200;
    doc.moveDown(1);

    // Quality assessment
    doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold');
    doc.text('OCENA KAKOVOSTI PODATKOV', 50);
    doc.moveDown(0.5);

    const qualityChecks = [
      {
        name: 'Zadostno število primerjav',
        passed: avgComparisonsPerItem >= 10,
        detail: `${avgComparisonsPerItem.toFixed(1)} primerjav/delo (priporočeno ≥10)`,
      },
      {
        name: 'Nizka pozicijska pristranskost',
        passed: Math.abs(positionBias) < 5,
        detail: `${Math.abs(positionBias).toFixed(1)}% (priporočeno <5%)`,
      },
      {
        name: 'Nizek delež sumljivih odzivov',
        passed: (flaggedComparisons.length / totalComparisons) < 0.05,
        detail: `${(flaggedComparisons.length / totalComparisons * 100).toFixed(1)}% (priporočeno <5%)`,
      },
      {
        name: 'Primeren odzivni čas',
        passed: avgResponseTime >= 2000 && avgResponseTime <= 30000,
        detail: `${(avgResponseTime / 1000).toFixed(1)}s povprečno (priporočeno 2-30s)`,
      },
    ];

    doc.fontSize(10);
    for (const check of qualityChecks) {
      const icon = check.passed ? '✓' : '✗';
      const color = check.passed ? '#16a34a' : '#dc2626';

      doc.fillColor(color).font('Helvetica-Bold').text(icon, 70, doc.y, { continued: true });
      doc.fillColor('#1e293b').font('Helvetica').text(`  ${check.name}: `, { continued: true });
      doc.fillColor('#64748b').text(check.detail);
    }

    // ========== PAGE 5: METHODOLOGY ==========
    doc.addPage();
    doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold');
    doc.text('METODOLOGIJA', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11).font('Helvetica').fillColor('#1e293b');

    const methodologyText = `
METODA SLEPEGA PRIMERJALNEGA OCENJEVANJA

Ta študija je uporabila metodo slepega primerjalnega ocenjevanja (ang. blind pairwise comparison), ki temelji na ELO sistemu ocenjevanja. Udeleženci so videli štiri likovna dela hkrati in izbrali najboljše, pri čemer niso poznali avtorjev ali prejšnjih ocen.

POSTOPEK GLASOVANJA

Vsak udeleženec je v vsaki kategoriji izvedel približno ${Math.round(avgComparisonsPerItem / 3)} krogov glasovanja. V vsakem krogu so bila prikazana 4 naključno izbrana dela, udeleženec pa je izbral tistega, ki mu je bil najbolj všeč. Vsaka izbira je ustvarila 3 primerjave (zmagovalec proti vsakemu od treh poražencev).

ELO SISTEM OCENJEVANJA

• Začetna ELO ocena: ${study.eloInitialRating}
• K-faktor: ${study.eloKFactor} ${study.adaptiveKFactor ? '(prilagodljiv)' : '(fiksen)'}
• Formula: E = 1 / (1 + 10^((Rb - Ra) / 400))

ELO sistem zagotavlja:
- Zmage proti višje ocenjenim delom prinesejo več točk
- Zmage proti nižje ocenjenim delom prinesejo manj točk
- Sistem se stabilizira po zadostnem številu primerjav

PREPREČEVANJE PRISTRANSKOSTI

1. Pozicijska naključnost: Položaj del na zaslonu je bil naključen
2. Anonimnost: Dela so bila prikazana brez oznak avtorja
3. Naključno izbiranje: Algoritem je zagotovil, da so bila vsa dela prikazana približno enako pogosto
4. Filtriranje testnih sej: Testne seje niso vplivale na končne rezultate

ALGORITEM UJEMANJA (Matchmaking)

Algoritem ${ALGO_VERSION} je uporabil dvofazni pristop:
1. Faza pokritosti: Vsako delo mora biti prikazano vsaj enkrat
2. Turnirska faza: Dodatni krogi z zmagovalci za jasnejše razločevanje najboljših

UMETNIČINA OCENA

Dela je pred glasovanjem ocenila tudi strokovna umetnica. Njena ocena je bila uporabljena za:
- Začetni ELO boost najboljših del (od +0 do +200 točk)
- Primerjavo z rezultati glasovanja (ujemanje v poročilu)
`.trim();

    doc.text(methodologyText, {
      align: 'justify',
      lineGap: 4,
    });

    // ========== PAGE 6+: FULL RANKINGS ==========
    doc.addPage();
    doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold');
    doc.text('POPOLNE RAZVRSTITVE', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica').fillColor('#64748b');
    doc.text('Vsa dela razvrščena po ELO oceni glasovanja', { align: 'center' });
    doc.moveDown(1.5);

    for (const catStat of categoryStats) {
      if (doc.y > 100) doc.addPage();

      doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold');
      doc.text(catStat.category.name.toUpperCase(), 50);
      doc.moveDown(0.5);

      // Table header
      const tableTop = doc.y;
      const col1 = 50;   // Rank
      const col2 = 80;   // ID
      const col3 = 120;  // ELO
      const col4 = 170;  // Games
      const col5 = 220;  // Win/Loss
      const col6 = 280;  // Win%
      const col7 = 330;  // Artist
      const col8 = 380;  // L/R Bias

      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
      doc.text('#', col1, tableTop);
      doc.text('ID', col2, tableTop);
      doc.text('ELO', col3, tableTop);
      doc.text('Primerjav', col4, tableTop);
      doc.text('Z/P', col5, tableTop);
      doc.text('Uspešnost', col6, tableTop);
      doc.text('Umetnica', col7, tableTop);
      doc.text('L/D Bias', col8, tableTop);

      doc.moveTo(col1, tableTop + 12).lineTo(440, tableTop + 12).strokeColor('#e2e8f0').stroke();

      const sortedItems = [...catStat.items].sort((a, b) => b.eloRating - a.eloRating);
      doc.font('Helvetica').fillColor('#1e293b');
      let rowY = tableTop + 18;

      for (let idx = 0; idx < sortedItems.length; idx++) {
        const item = sortedItems[idx];

        if (rowY > 750) {
          doc.addPage();
          rowY = 50;
        }

        const winRate = item.comparisonCount > 0
          ? Math.round((item.winCount / item.comparisonCount) * 100)
          : 0;
        const lrBias = item.comparisonCount > 0
          ? Math.round(((item.leftCount - item.rightCount) / item.comparisonCount) * 100)
          : 0;

        // Highlight top 12
        if (idx < 12) {
          doc.rect(col1 - 3, rowY - 2, 395, 12).fill(idx < 4 ? '#fef3c7' : '#f0fdf4');
          doc.fillColor('#1e293b');
        }

        doc.fontSize(8);
        doc.font(idx < 12 ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(`${idx + 1}`, col1, rowY);
        doc.text(`${item.externalId}`, col2, rowY);
        doc.text(`${Math.round(item.eloRating)}`, col3, rowY);
        doc.text(`${item.comparisonCount}`, col4, rowY);
        doc.text(`${item.winCount}/${item.lossCount}`, col5, rowY);
        doc.text(`${winRate}%`, col6, rowY);
        doc.text(item.artistRank ? `#${item.artistRank}` : '-', col7, rowY);
        doc.text(`${lrBias > 0 ? '+' : ''}${lrBias}%`, col8, rowY);

        rowY += 13;
      }

      doc.y = rowY + 15;
    }

    // ========== PAGE: AUDIT TRAIL ==========
    doc.addPage();
    doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold');
    doc.text('REVIZIJSKA SLED', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica').fillColor('#64748b');
    doc.text('Podrobnosti o izvedbi študije za namen revizije', { align: 'center' });
    doc.moveDown(1.5);

    doc.fillColor('#1e293b').fontSize(11).font('Helvetica');

    const dateRange = comparisons.length > 0
      ? `${comparisons[0].createdAt.toLocaleDateString('sl-SI')} - ${comparisons[comparisons.length - 1].createdAt.toLocaleDateString('sl-SI')}`
      : 'N/A';

    const auditInfo = [
      ['ID študije', study.id],
      ['Naslov', study.title],
      ['Različica algoritma', ALGO_VERSION],
      ['Obdobje glasovanja', dateRange],
      ['Skupno primerjav', comparisons.length.toString()],
      ['Unikatnih sej', sessions.length.toString()],
      ['Označenih primerjav', flaggedComparisons.length.toString()],
      ['Izključenih testnih sej', '(vsi podatki iz testnih sej izključeni)'],
    ];

    for (const [label, value] of auditInfo) {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(value);
    }

    doc.moveDown(2);

    // Session details
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('PREGLED SEJ');
    doc.moveDown(0.5);

    doc.fontSize(9).font('Helvetica');
    for (const session of sessions.slice(0, 20)) {
      doc.text(`• Seja ${session.id.slice(-8)}: ${session.comparisonCount} primerjav, ${session.isCompleted ? 'zaključena' : 'v teku'}, ${session.createdAt.toLocaleDateString('sl-SI')}`);
    }
    if (sessions.length > 20) {
      doc.text(`... in ${sessions.length - 20} dodatnih sej`);
    }

    doc.moveDown(2);

    // Legal note
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#64748b');
    doc.text('Opomba: Ta revizijska sled predstavlja vse ne-testne primerjave. Testne seje so izključene iz razvrstitev in statistik. Popolni podatki o primerjavah so na voljo v JSON/Excel formatu.', {
      align: 'justify',
    });

    // ========== FOOTERS ==========
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica').fillColor('#94a3b8');
      doc.text(
        `${study.title} | Stran ${i + 1} od ${pageCount} | SciBLIND Platform`,
        50,
        785,
        { align: 'center', width: 495 }
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
      detail: `PDF report downloaded (${comparisons.length} comparisons, ${items.length} items, ${sessions.length} sessions)`,
      metadata: { categoryId: categoryId || null, format: 'pdf', includeImages },
    });

    const filename = `izvrs-rezultati-${new Date().toISOString().split('T')[0]}.pdf`;

    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
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
