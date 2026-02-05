/**
 * SciBLIND Seed Script - IzVRS Study
 *
 * Creates the IzVRS study with:
 * - 3 categories (3. razredi, 4. razredi, 5. razredi)
 * - Images with artist ELO boosts
 * - 5 single-use access codes
 *
 * Run with: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Artist rankings from Excel (points -> image IDs)
// Points are 10 (best) to 1 (worst), converted to rank 1-10
const ARTIST_RANKINGS: Record<string, Record<number, number[]>> = {
  '3-razredi': {
    10: [1, 31],   // rank 1 = +200 ELO
    9: [7, 30],    // rank 2 = +180 ELO
    8: [15, 34],   // rank 3 = +160 ELO
    7: [24, 44],   // rank 4 = +140 ELO
    6: [3, 27],    // rank 5 = +120 ELO
    5: [2, 38],    // rank 6 = +100 ELO
    4: [4, 47],    // rank 7 = +80 ELO
    3: [6, 36],    // rank 8 = +60 ELO
    2: [12, 35],   // rank 9 = +40 ELO
    1: [22, 28],   // rank 10 = +20 ELO
  },
  '4-razredi': {
    10: [50, 78],
    9: [57, 69],
    8: [53, 66],
    7: [54, 76],
    6: [59, 65],
    5: [62, 70],
    4: [52, 64],
    3: [58, 74],
    2: [60, 73],
    1: [61, 71],
  },
  '5-razredi': {
    10: [90, 107],
    9: [83, 109],
    8: [88, 117],
    7: [95, 108],
    6: [100, 127],
    5: [98, 104],
    4: [91, 105],
    3: [103, 119],
    2: [97, 125],
    1: [89],  // Note: 5b rank 10 shows 107 again (duplicate), omitted
  },
};

// Category configuration
const CATEGORIES = [
  {
    name: '3. razredi',
    slug: '3-razredi',
    description: 'Likovni izdelki učencev 3. razredov',
    displayOrder: 0,
    imageIdRange: { start: 1, end: 49 },
  },
  {
    name: '4. razredi',
    slug: '4-razredi',
    description: 'Likovni izdelki učencev 4. razredov',
    displayOrder: 1,
    imageIdRange: { start: 50, end: 78 },
  },
  {
    name: '5. razredi',
    slug: '5-razredi',
    description: 'Likovni izdelki učencev 5. razredov',
    displayOrder: 2,
    imageIdRange: { start: 79, end: 128 },
  },
];

/**
 * Calculate artist ELO boost based on rank
 * Rank 1 (10 points) = +200, Rank 10 (1 point) = +20
 */
function calculateArtistBoost(rank: number): number {
  if (rank < 1 || rank > 10) return 0;
  return (11 - rank) * 20;
}

/**
 * Get artist rank for an image ID in a category
 */
function getArtistRank(categorySlug: string, externalId: number): number | null {
  const rankings = ARTIST_RANKINGS[categorySlug];
  if (!rankings) return null;

  for (const [points, ids] of Object.entries(rankings)) {
    if (ids.includes(externalId)) {
      // Convert points (10=best) to rank (1=best)
      return 11 - parseInt(points);
    }
  }
  return null;
}

/**
 * Hash an access code using SHA256
 */
function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Generate a random 5-digit code
 */
function generateNumericCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

async function main() {
  console.log('🌱 Starting IzVRS study seed...\n');

  // Check if study already exists
  const existingStudy = await prisma.study.findFirst({
    where: { title: 'IzVRS Likovni natečaj 2025' },
  });

  if (existingStudy) {
    console.log('⚠️  Study already exists. Deleting and recreating...');
    await prisma.study.delete({ where: { id: existingStudy.id } });
  }

  // 1. Create the study
  console.log('📚 Creating IzVRS study...');
  const study = await prisma.study.create({
    data: {
      title: 'IzVRS Likovni natečaj 2025',
      description: 'Slepa primerjava likovnih del za izbor najboljših za tisk. Pomagajte nam izbrati najboljše izdelke!',
      participantPrompt: 'Izberite sliko, ki vam je bolj všeč.',
      inputType: 'IMAGE',
      rankingMethod: 'ELO',
      language: 'sl',
      hasCategorySeparation: true,
      requireAccessCode: true,
      showRankingsToParticipants: false,
      comparisonsPerParticipant: 100,  // ~35 per category
      targetTopN: 4,  // Goal: select top 4 from each category
      eloKFactor: 32,
      eloInitialRating: 1500,
      createdBy: 'seed-script',
      logoUrls: ['Logo-ScAIentist.png', 'IzVRS-logo.png', 'Izvrstna-final.png'],
      methodologyText: `METODOLOGIJA OCENJEVANJA

Slike so bile ocenjene z uporabo sistema ELO rangiranja. Vsaka slika začne z oceno 1500 točk. Po vsaki primerjavi se oceni posodobita glede na pričakovan izid.

Umetnikov vnaprejšnji rang doda ELO točke:
- 1. mesto: +200 točk
- 2. mesto: +180 točk
- 3. mesto: +160 točk
- ...
- 10. mesto: +20 točk

V primeru izenačenega rezultata se upošteva umetnikov rang kot razločevalni kriterij.

Izbira primerov je sledila algoritmu, ki zagotavlja enakomernost in preprečuje pristransko pozicijo (levo/desno).`,
    },
  });

  console.log(`   ✓ Study created: ${study.id}`);

  // 2. Create categories and items
  for (const catConfig of CATEGORIES) {
    console.log(`\n📁 Creating category: ${catConfig.name}`);

    const category = await prisma.category.create({
      data: {
        studyId: study.id,
        name: catConfig.name,
        slug: catConfig.slug,
        description: catConfig.description,
        displayOrder: catConfig.displayOrder,
      },
    });

    console.log(`   ✓ Category created: ${category.id}`);

    // Create items for this category
    let itemCount = 0;
    for (let id = catConfig.imageIdRange.start; id <= catConfig.imageIdRange.end; id++) {
      const artistRank = getArtistRank(catConfig.slug, id);
      const artistBoost = artistRank ? calculateArtistBoost(artistRank) : 0;
      const initialElo = 1500 + artistBoost;

      await prisma.item.create({
        data: {
          studyId: study.id,
          categoryId: category.id,
          externalId: String(id),
          label: `Slika ${id}`,
          imageKey: `izvrs/${catConfig.slug}/${id}.webp`,
          artistRank,
          artistEloBoost: artistBoost,
          eloRating: initialElo,
        },
      });

      itemCount++;
    }

    console.log(`   ✓ Created ${itemCount} items (${catConfig.imageIdRange.start}-${catConfig.imageIdRange.end})`);

    // Show artist-ranked items
    const rankedItems = [];
    for (let rank = 1; rank <= 10; rank++) {
      const points = 11 - rank;
      const ids = ARTIST_RANKINGS[catConfig.slug]?.[points] || [];
      if (ids.length > 0) {
        const boost = calculateArtistBoost(rank);
        rankedItems.push(`   - Rank ${rank} (${points} pts, +${boost} ELO): IDs ${ids.join(', ')}`);
      }
    }
    if (rankedItems.length > 0) {
      console.log('   Artist rankings:');
      rankedItems.forEach((r) => console.log(r));
    }
  }

  // 3. Generate access codes
  console.log('\n🔐 Generating access codes...');
  const codes: string[] = [];

  for (let i = 1; i <= 5; i++) {
    const numericPart = generateNumericCode();
    const code = `IzVRS-ocenjevalec${numericPart}`;
    codes.push(code);

    await prisma.accessCode.create({
      data: {
        studyId: study.id,
        code,
        codeHash: hashCode(code),
        label: `Ocenjevalec ${i}`,
        isActive: true,
      },
    });
  }

  console.log('   ✓ Generated 5 access codes:');
  codes.forEach((code, i) => {
    console.log(`      ${i + 1}. ${code}`);
  });

  // 4. Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ IzVRS study seeded successfully!\n');
  console.log('Study ID:', study.id);
  console.log('Study URL:', `https://blind.scaientist.eu/study/${study.id}`);
  console.log('\nCategories:');
  CATEGORIES.forEach((c) => {
    const itemCount = c.imageIdRange.end - c.imageIdRange.start + 1;
    console.log(`  - ${c.name}: ${itemCount} images`);
  });
  console.log('\nAccess codes (single-use):');
  codes.forEach((code, i) => {
    console.log(`  ${i + 1}. ${code}`);
  });
  console.log('\n' + '='.repeat(50));

  // Save codes to file for reference
  const codesFile = path.join(process.cwd(), 'izvrs-access-codes.txt');
  fs.writeFileSync(
    codesFile,
    `IzVRS Likovni natečaj 2025 - Dostopne kode\n` +
      `Generirano: ${new Date().toISOString()}\n` +
      `Study ID: ${study.id}\n\n` +
      codes.map((code, i) => `${i + 1}. ${code}`).join('\n') +
      '\n\nOpozorilo: Vsaka koda je za enkratno uporabo!\n'
  );
  console.log(`\n📄 Codes saved to: ${codesFile}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
