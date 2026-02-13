/**
 * PDF Export API - IzVRS Likovni natečaj 2025
 *
 * GET /api/admin/studies/[studyId]/export-pdf
 *
 * Generates a comprehensive, branded PDF report following CGP guidelines:
 * - IzVRS and Izvrstna logos
 * - CGP color palette (green, teal, gold)
 * - Top 4 winners per category with images
 * - Full rankings
 * - ELO methodology explanation
 * - Statistical reliability metrics
 * - Audit trail
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/logging';
import PDFDocument from 'pdfkit';

const ALGO_VERSION = 'sciblind-v2-quad';
const SUPABASE_STORAGE_URL = 'https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images';

// Base URL for fetching logos (works in both dev and production)
const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
};

// CGP Color Palette
const COLORS = {
  // Primary greens
  greenDark: '#436334',
  greenMid: '#7b9e74',
  greenLight: '#afceb0',
  greenPale: '#d4e8d4',
  // Primary teal/blue
  tealDark: '#0a8fa5',
  tealMid: '#29c3eb',
  tealLight: '#6ceaff',
  tealPale: '#c4f5f7',
  // Secondary gold
  goldDark: '#d3a218',
  goldMid: '#fcc74f',
  goldLight: '#fce8a5',
  goldPale: '#fff4dc',
  // Neutrals
  white: '#ffffff',
  black: '#1a1a1a',
  gray: '#666666',
  grayLight: '#999999',
};

// Helper to fetch image as buffer from Supabase
async function fetchImageBuffer(imageKey: string): Promise<Buffer | null> {
  try {
    const url = `${SUPABASE_STORAGE_URL}/${imageKey}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('Failed to fetch image:', imageKey, err);
    return null;
  }
}

// Helper to load logo from public URL (works on Vercel serverless)
async function fetchLogoBuffer(filename: string): Promise<Buffer | null> {
  try {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/logos/${filename}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      console.error('Failed to fetch logo:', url, response.status);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('Failed to fetch logo:', filename, err);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const { studyId } = await params;

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
      where: { studyId },
      include: { category: true },
      orderBy: { eloRating: 'desc' },
    });

    // Get comparisons (non-test only)
    const comparisons = await prisma.comparison.findMany({
      where: {
        studyId,
        OR: [
          { flagReason: null },
          { flagReason: { not: 'test_session' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get sessions (non-test) with access code info
    const sessions = await prisma.session.findMany({
      where: {
        studyId,
        isTestSession: false,
      },
      include: {
        accessCode: {
          select: { label: true, code: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate per-category stats
    const categoryStats = study.categories.map(cat => {
      const catItems = items.filter(i => i.categoryId === cat.id);
      const catComparisons = comparisons.filter(c => c.categoryId === cat.id);
      const sortedItems = [...catItems].sort((a, b) => b.eloRating - a.eloRating);
      const top4 = sortedItems.slice(0, 4);
      const top12 = sortedItems.slice(0, 12);

      const avgComparisonsPerItem = catItems.length > 0
        ? catItems.reduce((sum, item) => sum + item.comparisonCount, 0) / catItems.length
        : 0;

      return {
        category: cat,
        items: catItems,
        comparisons: catComparisons,
        sortedItems,
        top4,
        top12,
        avgComparisonsPerItem,
      };
    });

    // Load logos (fetch from public URL for Vercel compatibility)
    const [izvrstnaLogo, izvrsLogo] = await Promise.all([
      fetchLogoBuffer('Izvrstna-final.png'),
      fetchLogoBuffer('IzVRS-logo.png'),
    ]);

    // Prefetch winner images (top 4 per category = 12 total)
    const winnerImages: Map<string, Buffer> = new Map();
    for (const catStat of categoryStats) {
      for (const item of catStat.top4) {
        if (item.imageKey) {
          const imgBuffer = await fetchImageBuffer(item.imageKey);
          if (imgBuffer) {
            winnerImages.set(item.id, imgBuffer);
          }
        }
      }
    }

    // Create PDF
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `Rezultati glasovanja - ${study.title}`,
        Author: 'IzVRS & Izvrstna',
        Subject: 'Rezultati slepega glasovanja za likovni natečaj',
        Creator: 'SciBLIND Platform',
        CreationDate: new Date(),
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 50;
    const contentWidth = pageWidth - 2 * margin;

    // ========== PAGE 1: COVER ==========
    // Green header bar
    doc.rect(0, 0, pageWidth, 120).fill(COLORS.greenDark);

    // Logos in header
    if (izvrstnaLogo) {
      try {
        doc.image(izvrstnaLogo, margin, 25, { height: 70 });
      } catch { /* ignore */ }
    }
    if (izvrsLogo) {
      try {
        doc.image(izvrsLogo, pageWidth - margin - 80, 20, { height: 80 });
      } catch { /* ignore */ }
    }

    // Decorative wave element (simplified)
    doc.rect(0, 120, pageWidth, 8).fill(COLORS.tealMid);
    doc.rect(0, 128, pageWidth, 4).fill(COLORS.tealLight);

    // Main title
    doc.y = 180;
    doc.fillColor(COLORS.greenDark).fontSize(32).font('Helvetica-Bold');
    doc.text('REZULTATI GLASOVANJA', { align: 'center' });

    doc.moveDown(0.3);
    doc.fillColor(COLORS.gray).fontSize(14).font('Helvetica');
    doc.text('Likovni natečaj za sledilnike IzVRS 2025', { align: 'center' });

    doc.moveDown(0.5);
    doc.fillColor(COLORS.tealDark).fontSize(11);
    doc.text('Slepo primerjalno ocenjevanje likovnih del učencev', { align: 'center' });

    // Summary box with gold accent
    doc.y = 320;
    const boxY = doc.y;
    doc.rect(margin, boxY, contentWidth, 160).fill(COLORS.goldPale);
    doc.rect(margin, boxY, 6, 160).fill(COLORS.goldDark);

    doc.fillColor(COLORS.greenDark).fontSize(14).font('Helvetica-Bold');
    doc.text('POVZETEK ŠTUDIJE', margin + 25, boxY + 20);

    doc.fontSize(11).font('Helvetica').fillColor(COLORS.black);
    const summaryStartY = boxY + 50;
    const col1 = margin + 25;
    const col2 = margin + 200;

    const summaryData = [
      ['Število ocenjevalcev:', `${sessions.length}`],
      ['Skupno primerjav:', `${comparisons.length}`],
      ['Ocenjenih del:', `${items.length}`],
      ['Kategorije:', study.categories.map(c => c.name).join(', ')],
      ['Način glasovanja:', 'Kvadruplet (4 slike, izberi najboljšo)'],
      ['Datum izvoza:', new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })],
    ];

    summaryData.forEach(([label, value], idx) => {
      const y = summaryStartY + idx * 18;
      doc.fillColor(COLORS.gray).text(label, col1, y);
      doc.fillColor(COLORS.black).font('Helvetica-Bold').text(value, col2, y);
      doc.font('Helvetica');
    });

    // Winners preview
    doc.y = boxY + 180;
    doc.moveDown(1.5);

    doc.fillColor(COLORS.greenDark).fontSize(16).font('Helvetica-Bold');
    doc.text('ZMAGOVALCI (TOP 4 NA KATEGORIJO)', { align: 'center' });
    doc.moveDown(0.8);

    // Winner summary for each category
    doc.fontSize(11).font('Helvetica');
    for (const catStat of categoryStats) {
      const top4Ids = catStat.top4.map(item => `#${item.externalId}`).join(', ');
      doc.fillColor(COLORS.tealDark).font('Helvetica-Bold').text(`${catStat.category.name}: `, { continued: true });
      doc.fillColor(COLORS.black).font('Helvetica').text(top4Ids);
    }

    // Footer on cover
    doc.y = pageHeight - 100;
    doc.fillColor(COLORS.grayLight).fontSize(9);
    doc.text(`Algoritem: ${ALGO_VERSION}`, { align: 'center' });
    doc.text('Generirano s platformo SciBLIND - blind.scaientist.eu', { align: 'center' });

    // ========== PAGE 2: WINNERS WITH IMAGES ==========
    doc.addPage();

    // Header
    doc.rect(0, 0, pageWidth, 50).fill(COLORS.greenDark);
    doc.fillColor(COLORS.white).fontSize(18).font('Helvetica-Bold');
    doc.text('ZMAGOVALCI PO KATEGORIJAH', margin, 15, { align: 'center', width: contentWidth });

    doc.y = 70;

    for (const catStat of categoryStats) {
      if (doc.y > pageHeight - 280) doc.addPage();

      // Category header with teal accent
      doc.rect(margin, doc.y, contentWidth, 30).fill(COLORS.tealPale);
      doc.rect(margin, doc.y, contentWidth, 4).fill(COLORS.tealMid);

      doc.fillColor(COLORS.greenDark).fontSize(14).font('Helvetica-Bold');
      doc.text(catStat.category.name.toUpperCase(), margin + 10, doc.y + 10);

      doc.y += 40;

      // Top 4 images in a 2x2 grid
      const imgSize = 110;
      const imgGap = 15;
      const startX = margin + (contentWidth - (2 * imgSize + imgGap)) / 2;

      for (let i = 0; i < 4; i++) {
        const item = catStat.top4[i];
        if (!item) continue;

        const row = Math.floor(i / 2);
        const col = i % 2;
        const x = startX + col * (imgSize + imgGap);
        const y = doc.y + row * (imgSize + 45);

        // Rank badge background
        const rankColors = [COLORS.goldDark, COLORS.grayLight, '#cd7f32', COLORS.tealMid];
        doc.rect(x, y, imgSize, imgSize + 35).fill(COLORS.greenPale);
        doc.rect(x, y, imgSize, 4).fill(rankColors[i]);

        // Image
        const imgBuffer = winnerImages.get(item.id);
        if (imgBuffer) {
          try {
            doc.image(imgBuffer, x + 5, y + 8, { fit: [imgSize - 10, imgSize - 10], align: 'center', valign: 'center' });
          } catch {
            doc.rect(x + 5, y + 8, imgSize - 10, imgSize - 10).fill(COLORS.grayLight);
          }
        } else {
          doc.rect(x + 5, y + 8, imgSize - 10, imgSize - 10).fill(COLORS.greenLight);
          doc.fillColor(COLORS.greenDark).fontSize(20).text(`#${item.externalId}`, x + 5, y + 50, { width: imgSize - 10, align: 'center' });
        }

        // Rank number badge
        doc.circle(x + 18, y + 18, 14).fill(rankColors[i]);
        doc.fillColor(COLORS.white).fontSize(12).font('Helvetica-Bold');
        doc.text(`${i + 1}`, x + 10, y + 12, { width: 16, align: 'center' });

        // Info below image
        doc.fillColor(COLORS.greenDark).fontSize(10).font('Helvetica-Bold');
        doc.text(`#${item.externalId}`, x + 5, y + imgSize + 2, { width: imgSize - 10, align: 'center' });

        doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica');
        const winRate = item.comparisonCount > 0 ? Math.round((item.winCount / item.comparisonCount) * 100) : 0;
        doc.text(`ELO: ${Math.round(item.eloRating)} | ${item.winCount}W/${item.lossCount}L (${winRate}%)`, x + 5, y + imgSize + 14, { width: imgSize - 10, align: 'center' });
      }

      doc.y += 2 * (imgSize + 45) + 20;
    }

    // ========== PAGE 3: HOW VOTING WORKED ==========
    doc.addPage();

    doc.rect(0, 0, pageWidth, 50).fill(COLORS.greenDark);
    doc.fillColor(COLORS.white).fontSize(18).font('Helvetica-Bold');
    doc.text('KAKO JE POTEKALO GLASOVANJE', margin, 15, { align: 'center', width: contentWidth });

    doc.y = 70;

    // Section: Voting process
    doc.fillColor(COLORS.greenDark).fontSize(14).font('Helvetica-Bold');
    doc.text('POSTOPEK GLASOVANJA');
    doc.moveDown(0.5);

    doc.fillColor(COLORS.black).fontSize(10).font('Helvetica');
    doc.text(`
Glasovanje je potekalo po metodi slepega primerjalnega ocenjevanja (ang. blind pairwise comparison). Vsak ocenjevalec je prejel unikatno dostopno kodo, ki mu je omogočila dostop do glasovalnega sistema.

V vsakem krogu glasovanja so bile prikazane 4 naključno izbrane slike. Ocenjevalec je izbral tisto, ki se mu je zdela najboljša. Ta izbira je ustvarila 3 primerjave: zmagovalec proti vsakemu od treh preostalih del.

Slike so bile prikazane brez oznak avtorjev ali prejšnjih ocen - popolnoma slepo ocenjevanje.
`.trim(), { align: 'justify', lineGap: 3 });

    doc.moveDown(1.5);

    // Section: Reviewers
    doc.fillColor(COLORS.greenDark).fontSize(14).font('Helvetica-Bold');
    doc.text('OCENJEVALCI');
    doc.moveDown(0.5);

    doc.fillColor(COLORS.black).fontSize(10).font('Helvetica');
    doc.text(`Glasovalo je ${sessions.length} ocenjevalcev. Vsak je imel unikatno dostopno kodo:`);
    doc.moveDown(0.5);

    // Reviewer table
    const reviewerTableY = doc.y;
    doc.rect(margin, reviewerTableY, contentWidth, 25).fill(COLORS.greenLight);

    doc.fillColor(COLORS.greenDark).fontSize(9).font('Helvetica-Bold');
    doc.text('Ocenjevalec', margin + 10, reviewerTableY + 8);
    doc.text('Primerjav', margin + 200, reviewerTableY + 8);
    doc.text('Datum', margin + 300, reviewerTableY + 8);
    doc.text('Status', margin + 400, reviewerTableY + 8);

    doc.font('Helvetica').fillColor(COLORS.black);
    let rowY = reviewerTableY + 30;

    sessions.forEach((session, idx) => {
      if (rowY > pageHeight - 100) {
        doc.addPage();
        rowY = 70;
      }

      const bgColor = idx % 2 === 0 ? COLORS.white : COLORS.greenPale;
      doc.rect(margin, rowY - 5, contentWidth, 20).fill(bgColor);

      doc.fillColor(COLORS.black).fontSize(9);
      doc.text(session.accessCode?.label || `Seja ${idx + 1}`, margin + 10, rowY);
      doc.text(session.comparisonCount.toString(), margin + 200, rowY);
      doc.text(session.createdAt.toLocaleDateString('sl-SI'), margin + 300, rowY);

      const statusColor = session.isCompleted ? COLORS.greenDark : COLORS.goldDark;
      const statusText = session.isCompleted ? 'Zaključeno' : 'V teku';
      doc.fillColor(statusColor).text(statusText, margin + 400, rowY);

      rowY += 20;
    });

    doc.y = rowY + 20;

    // ========== PAGE 4: ELO EXPLANATION ==========
    doc.addPage();

    doc.rect(0, 0, pageWidth, 50).fill(COLORS.tealDark);
    doc.fillColor(COLORS.white).fontSize(18).font('Helvetica-Bold');
    doc.text('ELO SISTEM OCENJEVANJA', margin, 15, { align: 'center', width: contentWidth });

    doc.y = 70;

    doc.fillColor(COLORS.black).fontSize(10).font('Helvetica');
    doc.text(`
ELO sistem je matematični model za ocenjevanje relativne moči tekmovalcev. Izvira iz šaha, vendar se uporablja tudi za ocenjevanje v mnogih drugih domenah.

ZAKAJ LAHKO IMATA DVE DELI ENAK REZULTAT (npr. 15/1), A RAZLIČNO ELO OCENO?

ELO sistem ne upošteva le števila zmag in porazov, temveč tudi KAKOVOST nasprotnikov:

1. RAZLIČNI NASPROTNIKI
   Če delo A premaga 15 visoko ocenjenih del in enkrat izgubi proti še višje ocenjenemu delu,
   bo imelo višjo ELO kot delo B, ki premaga 15 nizko ocenjenih del.

2. ZAČETNA ELO OCENA (Artist Boost)
   Dela so pred glasovanjem prejela začetno ELO oceno glede na oceno strokovne umetnice.
   Najbolje ocenjena dela so začela z višjo ELO (do +200 točk).

3. VRSTNI RED PRIMERJAV
   Če delo zgodaj izgubi, nato pa zmaga večkrat, bo imelo nižjo ELO kot delo,
   ki najprej zmaga in šele na koncu izgubi.

FORMULA:
`.trim(), { align: 'justify', lineGap: 3 });

    doc.moveDown(0.5);

    // ELO formula box
    doc.rect(margin + 50, doc.y, contentWidth - 100, 60).fill(COLORS.tealPale);
    doc.fillColor(COLORS.tealDark).fontSize(11).font('Helvetica-Bold');
    doc.text('Pričakovani rezultat: E = 1 / (1 + 10^((Rb - Ra) / 400))', margin + 60, doc.y + 15, { width: contentWidth - 120 });
    doc.text(`Nova ocena: R'a = Ra + K × (S - E)`, margin + 60, doc.y + 35, { width: contentWidth - 120 });
    doc.y += 70;

    doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica');
    doc.text(`Ra, Rb = trenutni ELO oceni | K = ${study.eloKFactor} (faktor prilagajanja) | S = dejanski rezultat (1 za zmago, 0 za poraz)`, { align: 'center' });

    doc.moveDown(1.5);

    // Key insight box
    doc.rect(margin, doc.y, contentWidth, 80).fill(COLORS.goldPale);
    doc.rect(margin, doc.y, 6, 80).fill(COLORS.goldDark);

    doc.fillColor(COLORS.greenDark).fontSize(12).font('Helvetica-Bold');
    doc.text('KLJUČNO SPOZNANJE', margin + 20, doc.y + 15);

    doc.fillColor(COLORS.black).fontSize(10).font('Helvetica');
    doc.text('ELO ocena ni le "število zmag". Upošteva celotno zgodbo: proti komu si zmagal, proti komu izgubil, in kdaj. Zato je ELO bolj zanesljiv pokazatelj kakovosti kot preprost razmerje zmag/porazov.', margin + 20, doc.y + 35, { width: contentWidth - 40, align: 'justify' });

    doc.y += 100;

    // Parameters used
    doc.fillColor(COLORS.greenDark).fontSize(14).font('Helvetica-Bold');
    doc.text('PARAMETRI TE ŠTUDIJE');
    doc.moveDown(0.5);

    const paramsData = [
      ['Začetna ELO ocena', study.eloInitialRating.toString()],
      ['K-faktor', `${study.eloKFactor} ${study.adaptiveKFactor ? '(prilagodljiv)' : '(fiksen)'}`],
      ['Min. primerjav na delo', study.minExposuresPerItem.toString()],
      ['Algoritem', ALGO_VERSION],
    ];

    paramsData.forEach(([label, value]) => {
      doc.fillColor(COLORS.gray).fontSize(10).font('Helvetica').text(`${label}: `, { continued: true });
      doc.fillColor(COLORS.black).font('Helvetica-Bold').text(value);
    });

    // ========== PAGE 5: FULL RANKINGS ==========
    doc.addPage();

    doc.rect(0, 0, pageWidth, 50).fill(COLORS.greenDark);
    doc.fillColor(COLORS.white).fontSize(18).font('Helvetica-Bold');
    doc.text('POPOLNE RAZVRSTITVE', margin, 15, { align: 'center', width: contentWidth });

    doc.y = 70;

    for (const catStat of categoryStats) {
      if (doc.y > 100) doc.addPage();

      // Category header
      doc.rect(margin, doc.y - 5, contentWidth, 28).fill(COLORS.greenLight);
      doc.fillColor(COLORS.greenDark).fontSize(12).font('Helvetica-Bold');
      doc.text(`${catStat.category.name.toUpperCase()} (${catStat.items.length} del)`, margin + 10, doc.y);
      doc.y += 30;

      // Table header
      const tableTop = doc.y;
      doc.rect(margin, tableTop, contentWidth, 18).fill(COLORS.tealPale);

      doc.fillColor(COLORS.tealDark).fontSize(8).font('Helvetica-Bold');
      const cols = [
        { label: '#', x: margin + 5, w: 25 },
        { label: 'ID', x: margin + 35, w: 35 },
        { label: 'ELO', x: margin + 75, w: 45 },
        { label: 'Primerjav', x: margin + 125, w: 55 },
        { label: 'Z/P', x: margin + 185, w: 45 },
        { label: 'Uspešnost', x: margin + 235, w: 55 },
        { label: 'Umetnica', x: margin + 295, w: 55 },
        { label: 'L/D Bias', x: margin + 355, w: 50 },
      ];

      cols.forEach(col => doc.text(col.label, col.x, tableTop + 5));

      doc.y = tableTop + 22;

      catStat.sortedItems.forEach((item, idx) => {
        if (doc.y > pageHeight - 50) {
          doc.addPage();
          doc.y = 50;
        }

        // Highlight top 4
        if (idx < 4) {
          const highlightColors = [COLORS.goldLight, '#e5e5e5', '#ffd9b3', COLORS.tealPale];
          doc.rect(margin, doc.y - 2, contentWidth, 14).fill(highlightColors[idx]);
        } else if (idx < 12) {
          doc.rect(margin, doc.y - 2, contentWidth, 14).fill(COLORS.greenPale);
        }

        const winRate = item.comparisonCount > 0
          ? Math.round((item.winCount / item.comparisonCount) * 100)
          : 0;
        const lrBias = item.comparisonCount > 0
          ? Math.round(((item.leftCount - item.rightCount) / item.comparisonCount) * 100)
          : 0;

        doc.fillColor(COLORS.black).fontSize(8);
        doc.font(idx < 4 ? 'Helvetica-Bold' : 'Helvetica');

        doc.text(`${idx + 1}`, cols[0].x, doc.y);
        doc.text(`${item.externalId}`, cols[1].x, doc.y);
        doc.text(`${Math.round(item.eloRating)}`, cols[2].x, doc.y);
        doc.text(`${item.comparisonCount}`, cols[3].x, doc.y);
        doc.text(`${item.winCount}/${item.lossCount}`, cols[4].x, doc.y);
        doc.text(`${winRate}%`, cols[5].x, doc.y);
        doc.text(item.artistRank ? `#${item.artistRank}` : '-', cols[6].x, doc.y);
        doc.text(`${lrBias > 0 ? '+' : ''}${lrBias}%`, cols[7].x, doc.y);

        doc.y += 14;
      });

      doc.y += 20;
    }

    // ========== PAGE: STATISTICAL RELIABILITY ==========
    doc.addPage();

    doc.rect(0, 0, pageWidth, 50).fill(COLORS.tealDark);
    doc.fillColor(COLORS.white).fontSize(18).font('Helvetica-Bold');
    doc.text('STATISTIČNA ZANESLJIVOST', margin, 15, { align: 'center', width: contentWidth });

    doc.y = 70;

    // Calculate metrics
    const totalComparisons = comparisons.length;
    const avgComparisonsPerItem = items.length > 0 ? totalComparisons / items.length : 0;

    const responseTimes = comparisons
      .map(c => c.responseTimeMs)
      .filter((t): t is number => t !== null && t > 0);

    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
    const medianResponseTime = responseTimes.length > 0
      ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)]
      : 0;

    const flaggedComparisons = comparisons.filter(c => c.isFlagged && c.flagReason !== 'test_session');

    let leftWins = 0;
    let rightWins = 0;
    for (const comp of comparisons) {
      if (comp.winnerId === comp.leftItemId) leftWins++;
      else rightWins++;
    }
    const positionBias = comparisons.length > 0
      ? ((leftWins - rightWins) / comparisons.length) * 100
      : 0;

    // Metrics box
    doc.rect(margin, doc.y, contentWidth, 150).fill(COLORS.greenPale);

    const metrics = [
      ['Skupno primerjav', totalComparisons.toString()],
      ['Povprečno primerjav na delo', avgComparisonsPerItem.toFixed(1)],
      ['Povprečen odzivni čas', `${(avgResponseTime / 1000).toFixed(1)} s`],
      ['Medianski odzivni čas', `${(medianResponseTime / 1000).toFixed(1)} s`],
      ['Označenih kot sumljivih', `${flaggedComparisons.length} (${(flaggedComparisons.length / Math.max(totalComparisons, 1) * 100).toFixed(1)}%)`],
      ['Pozicijska pristranskost', `${positionBias > 0 ? '+' : ''}${positionBias.toFixed(1)}% (L:${leftWins}, D:${rightWins})`],
    ];

    let metricY = doc.y + 20;
    metrics.forEach(([label, value]) => {
      doc.fillColor(COLORS.gray).fontSize(10).font('Helvetica').text(label, margin + 20, metricY);
      doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').text(value, margin + 250, metricY);
      metricY += 20;
    });

    doc.y += 170;

    // Quality checks
    doc.fillColor(COLORS.greenDark).fontSize(14).font('Helvetica-Bold');
    doc.text('OCENA KAKOVOSTI PODATKOV');
    doc.moveDown(0.5);

    const qualityChecks = [
      { name: 'Zadostno število primerjav', passed: avgComparisonsPerItem >= 10, detail: `${avgComparisonsPerItem.toFixed(1)} primerjav/delo (min. 10)` },
      { name: 'Nizka pozicijska pristranskost', passed: Math.abs(positionBias) < 5, detail: `${Math.abs(positionBias).toFixed(1)}% (max. 5%)` },
      { name: 'Nizek delež sumljivih', passed: (flaggedComparisons.length / Math.max(totalComparisons, 1)) < 0.05, detail: `${(flaggedComparisons.length / Math.max(totalComparisons, 1) * 100).toFixed(1)}% (max. 5%)` },
      { name: 'Primeren odzivni čas', passed: avgResponseTime >= 2000 && avgResponseTime <= 30000, detail: `${(avgResponseTime / 1000).toFixed(1)}s (2-30s)` },
    ];

    qualityChecks.forEach(check => {
      const icon = check.passed ? '✓' : '✗';
      const color = check.passed ? COLORS.greenDark : '#dc2626';

      doc.fillColor(color).fontSize(12).font('Helvetica-Bold').text(icon, margin + 10, doc.y, { continued: true });
      doc.fillColor(COLORS.black).fontSize(10).font('Helvetica').text(`  ${check.name}: `, { continued: true });
      doc.fillColor(COLORS.gray).text(check.detail);
      doc.moveDown(0.3);
    });

    // ========== PAGE: AUDIT ==========
    doc.addPage();

    doc.rect(0, 0, pageWidth, 50).fill(COLORS.greenDark);
    doc.fillColor(COLORS.white).fontSize(18).font('Helvetica-Bold');
    doc.text('REVIZIJSKA SLED', margin, 15, { align: 'center', width: contentWidth });

    doc.y = 70;

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
    ];

    auditInfo.forEach(([label, value]) => {
      doc.fillColor(COLORS.gray).fontSize(10).font('Helvetica').text(`${label}: `, { continued: true });
      doc.fillColor(COLORS.black).font('Helvetica-Bold').text(value);
    });

    doc.moveDown(2);

    doc.fillColor(COLORS.grayLight).fontSize(9).font('Helvetica');
    doc.text('Ta revizijska sled predstavlja vse ne-testne primerjave. Testne seje so izključene iz razvrstitev in statistik. Popolni podatki o primerjavah so na voljo v JSON formatu.', { align: 'justify' });

    // ========== FOOTERS ==========
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);

      // Footer bar
      doc.rect(0, pageHeight - 40, pageWidth, 40).fill(COLORS.greenPale);

      doc.fillColor(COLORS.greenDark).fontSize(8).font('Helvetica');
      doc.text(
        `${study.title} | Stran ${i + 1} od ${pageCount}`,
        margin,
        pageHeight - 28,
        { width: contentWidth / 2 }
      );

      doc.text(
        'IzVRS & Izvrstna | SciBLIND Platform',
        margin + contentWidth / 2,
        pageHeight - 28,
        { width: contentWidth / 2, align: 'right' }
      );
    }

    // Finalize PDF
    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    logActivity('EXPORT_DOWNLOADED', {
      studyId,
      detail: `PDF report downloaded (${comparisons.length} comparisons, ${items.length} items, ${sessions.length} sessions)`,
      metadata: { format: 'pdf', version: 'v2-branded' },
    });

    const filename = `IzVRS-Rezultati-Glasovanja-${new Date().toISOString().split('T')[0]}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
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
