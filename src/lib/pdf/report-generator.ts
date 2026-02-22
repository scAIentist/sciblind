/**
 * PDF Report Generator Service
 *
 * Generates configurable PDF reports for study results.
 * Uses Sharp for image compression to keep file sizes manageable.
 */

import { PrismaClient, Study, Category, Item, Session, Comparison } from '@prisma/client';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

// Types
export interface ReportConfig {
  // Sections to include
  includeCover: boolean;
  includeWinners: boolean;
  includeVotingProcess: boolean;
  includeEloExplanation: boolean;
  includeFullRankings: boolean;

  // Visual options
  winnersPerCategory: number; // 4, 8, or 12
  showArtistRank: boolean;
  showInitialElo: boolean;

  // Branding
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl?: string;
  secondaryLogoUrl?: string;

  // Text customization
  title: string;
  subtitle: string;
  footerText: string;

  // Image quality (JPEG compression 1-100)
  imageQuality: number;
}

export interface ReportData {
  study: Study & { categories: Category[] };
  items: (Item & { category: Category | null })[];
  comparisons: Comparison[];
  sessions: (Session & { accessCode: { label: string | null; code: string } | null })[];
}

// Default configuration
export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  includeCover: true,
  includeWinners: true,
  includeVotingProcess: true,
  includeEloExplanation: true,
  includeFullRankings: true,

  winnersPerCategory: 4,
  showArtistRank: true,
  showInitialElo: true,

  primaryColor: '#436334',   // Green dark
  secondaryColor: '#0a8fa5', // Teal dark
  accentColor: '#d3a218',    // Gold dark

  title: 'REZULTATI GLASOVANJA',
  subtitle: '',
  footerText: 'SciBLIND Platform',

  imageQuality: 80,
};

// Color palette derived from primary colors
function deriveColors(config: ReportConfig) {
  return {
    primary: config.primaryColor,
    primaryLight: lightenColor(config.primaryColor, 0.3),
    primaryPale: lightenColor(config.primaryColor, 0.6),
    secondary: config.secondaryColor,
    secondaryLight: lightenColor(config.secondaryColor, 0.4),
    secondaryPale: lightenColor(config.secondaryColor, 0.7),
    accent: config.accentColor,
    accentLight: lightenColor(config.accentColor, 0.4),
    accentPale: lightenColor(config.accentColor, 0.7),
    white: '#ffffff',
    black: '#1a1a1a',
    gray: '#666666',
    grayLight: '#999999',
  };
}

function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * amount));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * amount));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * amount));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

// Compress image using Sharp - this is the key to small PDF sizes
async function compressImage(buffer: Buffer, quality: number, maxSize: number = 400): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error('Failed to compress image:', err);
    return buffer; // Return original if compression fails
  }
}

// Helper to draw text at exact position
function drawText(doc: PDFKit.PDFDocument, text: string, x: number, y: number, options?: object) {
  doc.text(text, x, y, { ...options, lineBreak: false });
}

export class ReportGenerator {
  private doc: PDFKit.PDFDocument;
  private config: ReportConfig;
  private colors: ReturnType<typeof deriveColors>;
  private data: ReportData;
  private pageNum: number = 1;

  private readonly pageWidth = 595.28;
  private readonly pageHeight = 841.89;
  private readonly margin = 50;
  private readonly contentWidth: number;

  constructor(data: ReportData, config: Partial<ReportConfig> = {}) {
    this.data = data;
    this.config = { ...DEFAULT_REPORT_CONFIG, ...config };
    this.colors = deriveColors(this.config);
    this.contentWidth = this.pageWidth - 2 * this.margin;

    this.doc = new PDFDocument({
      size: 'A4',
      margin: this.margin,
      autoFirstPage: true,
      bufferPages: false,
      info: {
        Title: `${this.config.title} - ${data.study.title}`,
        Author: this.config.footerText,
        Subject: 'Study Results Report',
        Creator: 'SciBLIND Platform',
      },
    });

    // Register fonts (Windows paths - adjust for deployment)
    try {
      this.doc.registerFont('Arial', 'C:\\Windows\\Fonts\\arial.ttf');
      this.doc.registerFont('Arial-Bold', 'C:\\Windows\\Fonts\\arialbd.ttf');
    } catch {
      // Fallback to Helvetica if Arial not available
      console.warn('Arial font not found, using Helvetica');
    }
  }

  async generate(): Promise<Buffer> {
    const chunks: Buffer[] = [];

    return new Promise(async (resolve, reject) => {
      this.doc.on('data', (chunk) => chunks.push(chunk));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);

      try {
        // Prepare category stats
        const categoryStats = this.data.study.categories.map(cat => {
          const catItems = this.data.items.filter(i => i.categoryId === cat.id);
          const sortedItems = [...catItems].sort((a, b) => b.eloRating - a.eloRating);
          const topN = sortedItems.slice(0, this.config.winnersPerCategory);
          return { category: cat, items: catItems, sortedItems, topN };
        });

        // Pre-compress winner images
        const winnerImages = new Map<string, Buffer>();
        if (this.config.includeWinners) {
          for (const catStat of categoryStats) {
            for (const item of catStat.topN) {
              if (item.imageKey) {
                const imgBuffer = await this.loadImage(item.category?.slug || '', item.externalId || '');
                if (imgBuffer) {
                  const compressed = await compressImage(imgBuffer, this.config.imageQuality, 400);
                  winnerImages.set(item.id, compressed);
                }
              }
            }
          }
        }

        // Generate sections
        if (this.config.includeCover) {
          await this.generateCover(categoryStats);
        }

        if (this.config.includeWinners) {
          await this.generateWinners(categoryStats, winnerImages);
        }

        if (this.config.includeVotingProcess) {
          this.generateVotingProcess();
        }

        if (this.config.includeEloExplanation) {
          this.generateEloExplanation();
        }

        if (this.config.includeFullRankings) {
          this.generateFullRankings(categoryStats);
        }

        this.doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private async loadImage(categorySlug: string, externalId: string): Promise<Buffer | null> {
    const folders: Record<string, string> = {
      '3-razredi': '3-razredi',
      '4-razredi': '4-razredi',
      '5-razredi': '5-razredi',
    };

    const folder = folders[categorySlug];
    if (!folder) return null;

    // Try local file first
    const basePath = process.cwd();
    const pngPath = path.join(basePath, 'public', 'uploads', 'izvrs', folder, `${externalId}.png`);
    const jpgPath = pngPath.replace('.png', '.jpg');

    try {
      if (fs.existsSync(pngPath)) {
        return fs.readFileSync(pngPath);
      }
      if (fs.existsSync(jpgPath)) {
        return fs.readFileSync(jpgPath);
      }
    } catch {
      // Fall through to return null
    }

    return null;
  }

  private async loadLogo(filename: string): Promise<Buffer | null> {
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logos', filename);
      if (fs.existsSync(logoPath)) {
        const buffer = fs.readFileSync(logoPath);
        // Compress logos too
        return await compressImage(buffer, 85, 200);
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private addFooter() {
    this.doc.font('Arial').fontSize(8).fillColor(this.colors.primary);
    drawText(this.doc, `${this.config.subtitle || this.data.study.title} | Stran ${this.pageNum}`, this.margin, this.pageHeight - 30);
    drawText(this.doc, this.config.footerText, this.pageWidth - this.margin - 120, this.pageHeight - 30);
  }

  private async generateCover(categoryStats: Array<{ category: Category; topN: Item[] }>) {
    const { doc, colors, config, margin, pageWidth, pageHeight, contentWidth } = this;

    // Header bar
    doc.rect(0, 0, pageWidth, 100).fill(colors.primary);

    // Logos
    const izvrstnaLogo = await this.loadLogo('Izvrstna-final.png');
    const izvrsLogo = await this.loadLogo('IzVRS-logo.png');

    if (izvrstnaLogo) {
      try { doc.image(izvrstnaLogo, margin, 15, { height: 70 }); } catch { /* ignore */ }
    }
    if (izvrsLogo) {
      try { doc.image(izvrsLogo, pageWidth - margin - 150, 25, { width: 140 }); } catch { /* ignore */ }
    }

    // Decorative stripe
    doc.rect(0, 100, pageWidth, 6).fill(colors.secondary);
    doc.rect(0, 106, pageWidth, 3).fill(colors.secondaryLight);

    // Title
    doc.font('Arial-Bold').fontSize(28).fillColor(colors.primary);
    drawText(doc, config.title, 0, 150, { width: pageWidth, align: 'center' });

    doc.font('Arial').fontSize(14).fillColor(colors.gray);
    drawText(doc, config.subtitle || this.data.study.title, 0, 190, { width: pageWidth, align: 'center' });

    doc.font('Arial').fontSize(11).fillColor(colors.secondary);
    drawText(doc, 'Slepo primerjalno ocenjevanje', 0, 215, { width: pageWidth, align: 'center' });

    // Summary box
    const boxY = 260;
    doc.rect(margin, boxY, contentWidth, 155).fill(colors.accentPale);
    doc.rect(margin, boxY, 5, 155).fill(colors.accent);

    doc.font('Arial-Bold').fontSize(13).fillColor(colors.primary);
    drawText(doc, 'POVZETEK ŠTUDIJE', margin + 20, boxY + 15);

    const sessions = this.data.sessions;
    const comparisons = this.data.comparisons;
    const items = this.data.items;

    const summaryData = [
      ['Število ocenjevalcev:', `${sessions.length}`],
      ['Skupno primerjav:', `${comparisons.length}`],
      ['Ocenjenih del:', `${items.length}`],
      ['Kategorije:', this.data.study.categories.map(c => c.name).join(', ')],
      ['Način glasovanja:', 'Kvadruplet (4 slike, izberi najboljšo)'],
      ['Datum izvoza:', new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })],
    ];

    summaryData.forEach(([label, value], idx) => {
      const y = boxY + 42 + idx * 17;
      doc.font('Arial').fontSize(10).fillColor(colors.gray);
      drawText(doc, label, margin + 20, y);
      doc.font('Arial-Bold').fillColor(colors.black);
      drawText(doc, value, margin + 170, y);
    });

    // Winners summary
    doc.font('Arial-Bold').fontSize(15).fillColor(colors.primary);
    drawText(doc, `ZMAGOVALCI (TOP ${config.winnersPerCategory} NA KATEGORIJO)`, 0, boxY + 180, { width: pageWidth, align: 'center' });

    let summaryY = boxY + 210;
    for (const catStat of categoryStats) {
      const topIds = catStat.topN.map(item => `#${item.externalId}`).join(', ');
      doc.font('Arial-Bold').fontSize(11).fillColor(colors.secondary);
      drawText(doc, `${catStat.category.name}: `, margin + 100, summaryY);
      doc.font('Arial').fillColor(colors.black);
      drawText(doc, topIds, margin + 180, summaryY);
      summaryY += 18;
    }

    // Footer info
    doc.font('Arial').fontSize(9).fillColor(colors.grayLight);
    drawText(doc, 'Algoritem: sciblind-v2-quad', 0, pageHeight - 80, { width: pageWidth, align: 'center' });
    drawText(doc, 'Generirano s platformo SciBLIND - blind.scaientist.eu', 0, pageHeight - 68, { width: pageWidth, align: 'center' });

    this.addFooter();
  }

  private async generateWinners(
    categoryStats: Array<{ category: Category; topN: Item[] }>,
    winnerImages: Map<string, Buffer>
  ) {
    const { doc, colors, margin, pageWidth, config } = this;

    for (const catStat of categoryStats) {
      doc.addPage();
      this.pageNum++;

      // Header
      doc.rect(0, 0, pageWidth, 45).fill(colors.primary);
      doc.font('Arial-Bold').fontSize(16).fillColor(colors.white);
      drawText(doc, `TOP ${config.winnersPerCategory}: ${catStat.category.name.toUpperCase()}`, 0, 14, { width: pageWidth, align: 'center' });

      const imgSize = 200;
      const imgGap = 25;
      const gridWidth = 2 * imgSize + imgGap;
      const startX = (pageWidth - gridWidth) / 2;

      const rankColors = [colors.accent, colors.grayLight, '#cd7f32', colors.secondary];

      for (let i = 0; i < Math.min(4, catStat.topN.length); i++) {
        const item = catStat.topN[i];
        const row = Math.floor(i / 2);
        const col = i % 2;
        const x = startX + col * (imgSize + imgGap);
        const y = 65 + row * (imgSize + 85);

        // Card background
        doc.rect(x, y, imgSize, imgSize + 55).fill(colors.primaryPale);
        doc.rect(x, y, imgSize, 5).fill(rankColors[i] || colors.secondary);

        // Image
        const imgBuffer = winnerImages.get(item.id);
        if (imgBuffer) {
          try {
            doc.image(imgBuffer, x + 8, y + 12, {
              fit: [imgSize - 16, imgSize - 16],
              align: 'center',
              valign: 'center'
            });
          } catch { /* ignore */ }
        }

        // Rank badge
        doc.circle(x + 20, y + 20, 16).fill(rankColors[i] || colors.secondary);
        doc.font('Arial-Bold').fontSize(14).fillColor(colors.white);
        drawText(doc, `${i + 1}`, x + 13, y + 13);

        // Item info
        doc.font('Arial-Bold').fontSize(12).fillColor(colors.primary);
        drawText(doc, `Slika #${item.externalId}`, x, y + imgSize + 8, { width: imgSize, align: 'center' });

        const winRate = item.comparisonCount > 0 ? Math.round((item.winCount / item.comparisonCount) * 100) : 0;
        doc.font('Arial').fontSize(9).fillColor(colors.gray);
        drawText(doc, `ELO: ${Math.round(item.eloRating)} | ${item.winCount}Z / ${item.lossCount}P (${winRate}%)`, x, y + imgSize + 24, { width: imgSize, align: 'center' });

        if (config.showArtistRank && item.artistRank) {
          doc.font('Arial').fontSize(8).fillColor(colors.secondary);
          drawText(doc, `Ocena umetnice: #${item.artistRank}`, x, y + imgSize + 38, { width: imgSize, align: 'center' });
        }
      }

      this.addFooter();
    }
  }

  private generateVotingProcess() {
    const { doc, colors, margin, pageWidth, contentWidth, pageHeight } = this;
    const sessions = this.data.sessions;

    doc.addPage();
    this.pageNum++;

    doc.rect(0, 0, pageWidth, 45).fill(colors.primary);
    doc.font('Arial-Bold').fontSize(16).fillColor(colors.white);
    drawText(doc, 'KAKO JE POTEKALO GLASOVANJE', 0, 14, { width: pageWidth, align: 'center' });

    let yPos = 65;

    doc.font('Arial-Bold').fontSize(13).fillColor(colors.primary);
    drawText(doc, 'POSTOPEK GLASOVANJA', margin, yPos);
    yPos += 25;

    doc.font('Arial').fontSize(10).fillColor(colors.black);
    doc.text('Glasovanje je potekalo po metodi slepega primerjalnega ocenjevanja. Vsak ocenjevalec je prejel unikatno dostopno kodo, ki mu je omogočila dostop do glasovalnega sistema.', margin, yPos, { width: contentWidth, align: 'justify' });
    yPos += 45;

    doc.text('V vsakem krogu glasovanja so bile prikazane 4 naključno izbrane slike. Ocenjevalec je izbral tisto, ki se mu je zdela najboljša. Ta izbira je ustvarila 3 primerjave: zmagovalec proti vsakemu od treh preostalih del.', margin, yPos, { width: contentWidth, align: 'justify' });
    yPos += 45;

    doc.text('Slike so bile prikazane brez oznak avtorjev ali prejšnjih ocen - popolnoma slepo ocenjevanje.', margin, yPos, { width: contentWidth, align: 'justify' });
    yPos += 40;

    doc.font('Arial-Bold').fontSize(13).fillColor(colors.primary);
    drawText(doc, 'OCENJEVALCI', margin, yPos);
    yPos += 25;

    doc.font('Arial').fontSize(10).fillColor(colors.black);
    drawText(doc, `Glasovalo je ${sessions.length} ocenjevalcev. Vsak je imel unikatno dostopno kodo:`, margin, yPos);
    yPos += 25;

    // Reviewer table
    const tableY = yPos;
    const rowH = 22;
    const colX = [margin, margin + 180, margin + 260, margin + 360];

    doc.rect(margin, tableY, contentWidth, rowH).fill(colors.primaryLight);
    doc.font('Arial-Bold').fontSize(10).fillColor(colors.primary);
    drawText(doc, 'Ocenjevalec', colX[0] + 10, tableY + 6);
    drawText(doc, 'Primerjav', colX[1] + 5, tableY + 6);
    drawText(doc, 'Datum', colX[2] + 5, tableY + 6);
    drawText(doc, 'Status', colX[3] + 5, tableY + 6);

    sessions.forEach((session, idx) => {
      const rowTop = tableY + rowH + idx * rowH;
      const bgColor = idx % 2 === 0 ? colors.white : colors.primaryPale;
      doc.rect(margin, rowTop, contentWidth, rowH).fill(bgColor);

      doc.font('Arial').fontSize(10).fillColor(colors.black);
      drawText(doc, session.accessCode?.label || `Seja ${idx + 1}`, colX[0] + 10, rowTop + 6);
      drawText(doc, session.comparisonCount.toString(), colX[1] + 5, rowTop + 6);
      drawText(doc, session.createdAt.toLocaleDateString('sl-SI'), colX[2] + 5, rowTop + 6);

      const isCompleted = session.comparisonCount > 0;
      doc.fillColor(isCompleted ? colors.primary : colors.accent);
      drawText(doc, isCompleted ? 'Zaključeno' : 'V teku', colX[3] + 5, rowTop + 6);
    });

    this.addFooter();
  }

  private generateEloExplanation() {
    const { doc, colors, margin, pageWidth, contentWidth } = this;

    doc.addPage();
    this.pageNum++;

    doc.rect(0, 0, pageWidth, 45).fill(colors.secondary);
    doc.font('Arial-Bold').fontSize(16).fillColor(colors.white);
    drawText(doc, 'ELO SISTEM OCENJEVANJA', 0, 14, { width: pageWidth, align: 'center' });

    let yPos = 65;

    doc.font('Arial-Bold').fontSize(12).fillColor(colors.primary);
    drawText(doc, 'KAJ JE ELO SISTEM?', margin, yPos);
    yPos += 20;

    doc.font('Arial').fontSize(10).fillColor(colors.black);
    doc.text('ELO sistem je matematični model za ocenjevanje relativne moči tekmovalcev na podlagi rezultatov medsebojnih primerjav. Prvotno razvit za šah, se danes uporablja na številnih področjih - od e-športa do ocenjevanja kakovosti fotografij in umetniških del.', margin, yPos, { width: contentWidth, align: 'justify' });
    yPos += 50;

    doc.font('Arial-Bold').fontSize(12).fillColor(colors.primary);
    drawText(doc, 'KAKO DELUJE?', margin, yPos);
    yPos += 20;

    doc.font('Arial').fontSize(10).fillColor(colors.black);
    doc.text('Vsako delo začne z začetno ELO oceno. Po vsaki primerjavi se oceni zmagovalca in poraženca posodobita glede na:', margin, yPos, { width: contentWidth });
    yPos += 30;

    const bullets = [
      'Pričakovani izid - če delo z nižjo oceno premaga delo z višjo, pridobi več točk',
      'Razlika v ocenah - večja razlika pomeni večjo spremembo točk za presenečenja',
      'K-faktor - določa občutljivost sistema na nove rezultate',
    ];

    bullets.forEach(b => {
      doc.font('Arial').fontSize(10).fillColor(colors.black);
      drawText(doc, `•  ${b}`, margin + 15, yPos);
      yPos += 18;
    });

    yPos += 10;
    doc.font('Arial-Bold').fontSize(12).fillColor(colors.primary);
    drawText(doc, 'ZAKAJ NE LE ŠTETI ZMAG IN PORAZOV?', margin, yPos);
    yPos += 20;

    doc.font('Arial').fontSize(10).fillColor(colors.black);
    doc.text('ELO sistem upošteva kontekst vsake primerjave, ne le končnega rezultata. Dve deli z enakim razmerjem zmag/porazov (npr. 15/5) imata lahko različni ELO oceni zaradi:', margin, yPos, { width: contentWidth, align: 'justify' });
    yPos += 40;

    const reasons = [
      ['Kakovost nasprotnikov:', 'Zmaga proti visoko ocenjenemu delu prinese več točk.'],
      ['Vrstni red primerjav:', 'Zgodnje zmage/porazi imajo večji vpliv na končno oceno.'],
      ['Začetna ocena:', 'Dela so prejela začetno ELO oceno glede na oceno umetnice.'],
    ];

    reasons.forEach(([title, desc]) => {
      doc.font('Arial-Bold').fontSize(10).fillColor(colors.black);
      drawText(doc, `•  ${title}`, margin + 15, yPos);
      doc.font('Arial');
      drawText(doc, desc, margin + 155, yPos);
      yPos += 18;
    });

    // Key insight box
    yPos += 15;
    doc.rect(margin, yPos, contentWidth, 60).fill(colors.accentPale);
    doc.rect(margin, yPos, 5, 60).fill(colors.accent);

    doc.font('Arial-Bold').fontSize(11).fillColor(colors.primary);
    drawText(doc, 'PREDNOSTI ELO SISTEMA', margin + 18, yPos + 12);

    doc.font('Arial').fontSize(10).fillColor(colors.black);
    doc.text('ELO ocena predstavlja celovito sliko kakovosti dela - upošteva ne le število zmag, temveč tudi proti komu so bile dosežene. To omogoča bolj zanesljivo in pošteno razvrstitev kot preprosto štetje glasov.', margin + 18, yPos + 30, { width: contentWidth - 36, align: 'justify' });

    this.addFooter();
  }

  private generateFullRankings(categoryStats: Array<{ category: Category; sortedItems: Item[] }>) {
    const { doc, colors, config, margin, pageWidth, pageHeight, contentWidth } = this;
    const study = this.data.study;
    const comparisons = this.data.comparisons;

    for (const catStat of categoryStats) {
      doc.addPage();
      this.pageNum++;

      doc.rect(0, 0, pageWidth, 45).fill(colors.primary);
      doc.font('Arial-Bold').fontSize(16).fillColor(colors.white);
      drawText(doc, `POPOLNE RAZVRSTITVE: ${catStat.category.name.toUpperCase()}`, 0, 14, { width: pageWidth, align: 'center' });

      const tableTop = 55;
      const rowHeight = 14;

      // Column definitions
      const rankCols = [
        { label: '#', x: margin, w: 20 },
        { label: 'ID', x: margin + 22, w: 30 },
        { label: 'ELO', x: margin + 55, w: 40 },
        { label: 'Primerjav', x: margin + 100, w: 50 },
        { label: 'Zmage', x: margin + 155, w: 40 },
        { label: 'Porazi', x: margin + 200, w: 40 },
        { label: 'Uspešnost', x: margin + 245, w: 50 },
      ];

      if (config.showArtistRank) {
        rankCols.push({ label: 'Umetnica', x: margin + 305, w: 50 });
      }
      if (config.showInitialElo) {
        rankCols.push({ label: 'Zač. ELO', x: config.showArtistRank ? margin + 365 : margin + 305, w: 50 });
      }

      // Header row
      doc.rect(margin, tableTop, contentWidth, rowHeight + 2).fill(colors.secondaryPale);
      doc.font('Arial-Bold').fontSize(8).fillColor(colors.secondary);
      rankCols.forEach(col => drawText(doc, col.label, col.x + 2, tableTop + 3));

      let currentY = tableTop + rowHeight + 4;

      catStat.sortedItems.forEach((item, idx) => {
        if (currentY > pageHeight - 60) {
          this.addFooter();
          doc.addPage();
          this.pageNum++;
          currentY = 50;

          doc.rect(margin, currentY, contentWidth, rowHeight + 2).fill(colors.secondaryPale);
          doc.font('Arial-Bold').fontSize(8).fillColor(colors.secondary);
          rankCols.forEach(col => drawText(doc, col.label, col.x + 2, currentY + 3));
          currentY += rowHeight + 4;
        }

        // Row background
        if (idx < 4) {
          const highlightColors = [colors.accentLight, '#e8e8e8', '#ffd9b3', colors.secondaryPale];
          doc.rect(margin, currentY - 1, contentWidth, rowHeight).fill(highlightColors[idx]);
        } else if (idx < 12) {
          doc.rect(margin, currentY - 1, contentWidth, rowHeight).fill(colors.primaryPale);
        }

        const winRate = item.comparisonCount > 0 ? Math.round((item.winCount / item.comparisonCount) * 100) : 0;
        const initialElo = study.eloInitialRating + (item.artistEloBoost || 0);

        doc.font(idx < 4 ? 'Arial-Bold' : 'Arial').fontSize(8).fillColor(colors.black);

        drawText(doc, `${idx + 1}`, rankCols[0].x + 2, currentY + 2);
        drawText(doc, item.externalId || '-', rankCols[1].x + 2, currentY + 2);
        drawText(doc, `${Math.round(item.eloRating)}`, rankCols[2].x + 2, currentY + 2);
        drawText(doc, `${item.comparisonCount}`, rankCols[3].x + 2, currentY + 2);
        drawText(doc, `${item.winCount}`, rankCols[4].x + 2, currentY + 2);
        drawText(doc, `${item.lossCount}`, rankCols[5].x + 2, currentY + 2);
        drawText(doc, `${winRate}%`, rankCols[6].x + 2, currentY + 2);

        if (config.showArtistRank) {
          drawText(doc, item.artistRank ? `#${item.artistRank}` : '-', rankCols[7].x + 2, currentY + 2);
        }
        if (config.showInitialElo) {
          const eloColIdx = config.showArtistRank ? 8 : 7;
          drawText(doc, `${Math.round(initialElo)}`, rankCols[eloColIdx].x + 2, currentY + 2);
        }

        currentY += rowHeight;
      });

      // Category summary
      currentY += 10;
      const catComparisons = comparisons.filter(c => c.categoryId === catStat.category.id).length;
      doc.font('Arial').fontSize(8).fillColor(colors.gray);
      drawText(doc, `Skupaj ${catStat.sortedItems.length} del | ${catComparisons} primerjav v tej kategoriji`, margin, currentY);

      this.addFooter();
    }
  }
}

// Convenience function for generating reports
export async function generateStudyReport(
  prisma: PrismaClient,
  studyId: string,
  config: Partial<ReportConfig> = {}
): Promise<Buffer> {
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    include: { categories: { orderBy: { displayOrder: 'asc' } } },
  });

  if (!study) {
    throw new Error('Study not found');
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

  const generator = new ReportGenerator(
    { study, items, comparisons, sessions },
    config
  );

  return generator.generate();
}
