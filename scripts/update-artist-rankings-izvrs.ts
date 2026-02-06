/**
 * Update Artist Rankings from IzVRS Excel file
 *
 * Excel format: Razred, Št točk (score - higher=better), Slika ID
 * Converts score to rank (score 25 -> rank 1 in that category)
 *
 * Formula: newElo = baseElo (1500) + boost
 * - Rank 1: +200 points
 * - Last rank: +20 points
 *
 * Run with: npx tsx scripts/update-artist-rankings-izvrs.ts
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const IZVRS_STUDY_ID = 'cml808mzc0000m104un333c69';
const EXCEL_PATH = 'C:/Users/Luka/Downloads/SciBLIND/Slike likovni natečaj - po razredih/Seznam_slik_ocene_slikarka_ALL.xlsx';

interface RankingData {
  razred: string;    // e.g., "3a", "3b", "4a", "4b", "5a", "5b"
  score: number;     // Higher = better
  slikaId: number;   // Image ID (1-128)
}

/**
 * Map Excel Razred to database category
 */
function mapRazredToCategory(razred: string): string {
  const mapping: Record<string, string> = {
    '3a': '3. razredi',
    '3b': '3. razredi',
    '4a': '4. razredi',
    '4b': '4. razredi',
    '5a': '5. razredi',
    '5b': '5. razredi',
  };
  return mapping[razred.toLowerCase()] || razred;
}

/**
 * Calculate ELO boost based on rank within category
 * Linear scale from +200 (rank 1 = best) to 0 (last rank = worst)
 * Last rank starts at neutral 1500, best rank gets +200 → 1700
 */
function calculateBoost(rank: number, totalInCategory: number): number {
  if (totalInCategory <= 1) return 200;
  // rank 1 = best → +200, rank N = worst → 0
  const boost = 200 * (1 - (rank - 1) / (totalInCategory - 1));
  return Math.round(boost * 100) / 100;
}

async function main() {
  console.log('='.repeat(60));
  console.log('🎨 Update Artist Rankings - IzVRS Study');
  console.log('='.repeat(60));
  console.log();

  // Read Excel file
  console.log('📖 Reading Excel file...');
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(sheet, { header: 1 });

  // Parse data (skip header row)
  const rankings: RankingData[] = [];
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length < 3) continue;

    const razred = String(row[0] ?? '').trim();
    const score = Number(row[1]);
    const slikaId = Number(row[2]);

    if (!razred || isNaN(score) || isNaN(slikaId)) continue;

    rankings.push({ razred, score, slikaId });
  }

  console.log(`  Found ${rankings.length} ranking entries\n`);

  // Group by SUBCATEGORY (3a, 3b, etc.) for ranking - artist ranked each separately
  const bySubcategory = new Map<string, RankingData[]>();
  for (const r of rankings) {
    const subcat = r.razred.toLowerCase();
    const existing = bySubcategory.get(subcat) || [];
    existing.push(r);
    bySubcategory.set(subcat, existing);
  }

  // Calculate ranks within each SUBCATEGORY (higher score = lower rank = better)
  const ranksById = new Map<number, { categoryName: string; subcategory: string; rank: number; totalInSubcategory: number }>();

  for (const [subcat, items] of bySubcategory) {
    // Sort by score descending (highest score = rank 1)
    items.sort((a, b) => b.score - a.score);
    const dbCategory = mapRazredToCategory(subcat);

    // Assign ranks within subcategory
    items.forEach((item, idx) => {
      ranksById.set(item.slikaId, {
        categoryName: dbCategory,
        subcategory: subcat,
        rank: idx + 1,
        totalInSubcategory: items.length,
      });
    });

    console.log(`📁 ${subcat} → ${dbCategory}: ${items.length} items (scores ${items[items.length - 1].score} to ${items[0].score})`);
  }

  console.log();

  // Get study categories from DB
  const study = await prisma.study.findUnique({
    where: { id: IZVRS_STUDY_ID },
    include: { categories: true },
  });

  if (!study) {
    console.error('❌ Study not found!');
    process.exit(1);
  }

  console.log(`📚 Study: ${study.title}`);
  console.log(`   Categories: ${study.categories.map(c => c.name).join(', ')}\n`);

  // Build category name to ID mapping
  const categoryMap = new Map<string, string>();
  for (const cat of study.categories) {
    categoryMap.set(cat.name.toLowerCase(), cat.id);
  }

  // Get all items
  const items = await prisma.item.findMany({
    where: { studyId: IZVRS_STUDY_ID },
    include: { category: true },
  });

  console.log(`📦 Found ${items.length} items in database\n`);

  // Prepare updates
  const updates: Array<{
    item: typeof items[0];
    newRank: number;
    newBoost: number;
    newElo: number;
    totalInCat: number;
  }> = [];

  let matchCount = 0;
  let noMatchCount = 0;

  for (const item of items) {
    // Extract numeric ID from externalId (e.g., "001" -> 1)
    const numericId = parseInt(item.externalId || '0', 10);
    if (!numericId) {
      noMatchCount++;
      continue;
    }

    const rankInfo = ranksById.get(numericId);
    if (!rankInfo) {
      console.warn(`  ⚠️ No ranking found for item ${item.externalId} (ID ${numericId})`);
      noMatchCount++;
      continue;
    }

    // Verify category matches
    const expectedCatId = categoryMap.get(rankInfo.categoryName.toLowerCase());
    if (item.categoryId !== expectedCatId) {
      console.warn(`  ⚠️ Category mismatch for item ${item.externalId}: DB=${item.category?.name}, Excel=${rankInfo.categoryName}`);
      // Still apply the ranking - the Excel is the source of truth
    }

    // Use subcategory size for boost calculation (artist ranked each subcategory separately)
    const newBoost = calculateBoost(rankInfo.rank, rankInfo.totalInSubcategory);
    const baseElo = 1500; // Start from base ELO (no prior voting)
    const newElo = baseElo + newBoost;

    updates.push({
      item,
      newRank: rankInfo.rank,
      newBoost,
      newElo,
      totalInCat: rankInfo.totalInSubcategory,
    });

    matchCount++;
  }

  console.log(`\n✓ Matched ${matchCount} items, ${noMatchCount} without rankings\n`);

  // Show preview by category
  console.log('='.repeat(60));
  console.log('📋 Update Preview');
  console.log('='.repeat(60));

  const updatesByCategory = new Map<string, typeof updates>();
  for (const u of updates) {
    const catName = u.item.category?.name || 'Unknown';
    const existing = updatesByCategory.get(catName) || [];
    existing.push(u);
    updatesByCategory.set(catName, existing);
  }

  for (const [catName, catUpdates] of updatesByCategory) {
    console.log(`\n📁 ${catName} (${catUpdates.length} items):`);
    console.log('-'.repeat(50));

    // Sort by rank
    catUpdates.sort((a, b) => a.newRank - b.newRank);

    // Show top 5 and bottom 3
    const showItems = [...catUpdates.slice(0, 5), ...catUpdates.slice(-3)];
    let lastShown = 0;

    for (const u of showItems) {
      if (u.newRank > lastShown + 1 && lastShown > 0) {
        console.log('  ...');
      }
      const boostStr = u.newBoost >= 0 ? `+${u.newBoost.toFixed(1)}` : u.newBoost.toFixed(1);
      console.log(`  Rank ${u.newRank.toString().padStart(2)}: ID ${u.item.externalId} → ELO ${u.newElo.toFixed(1)} (boost ${boostStr})`);
      lastShown = u.newRank;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Updates to apply: ${updates.length}`);
  console.log(`   Items without ranking: ${noMatchCount}`);
  console.log('='.repeat(60));

  // Check for --yes flag
  const autoConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

  if (!autoConfirm) {
    console.log('\n⚠️  This will UPDATE artist rankings and ELO boosts.');
    console.log('   Since no voting has started, this sets the initial ELO.\n');
    console.log('   Run with --yes flag to apply changes:');
    console.log('   npx tsx scripts/update-artist-rankings-izvrs.ts --yes\n');
    await prisma.$disconnect();
    return;
  }

  // Apply updates
  console.log('\n🚀 Applying updates...\n');

  let updateCount = 0;
  for (const update of updates) {
    await prisma.item.update({
      where: { id: update.item.id },
      data: {
        artistRank: update.newRank,
        artistEloBoost: update.newBoost,
        eloRating: update.newElo,
      },
    });

    updateCount++;
    if (updateCount % 25 === 0) {
      console.log(`  ✓ Updated ${updateCount}/${updates.length} items...`);
    }
  }

  console.log(`  ✓ Updated ${updateCount}/${updates.length} items`);

  // Verification
  console.log('\n🔍 Verifying updates...\n');

  const verifyItems = await prisma.item.findMany({
    where: { studyId: IZVRS_STUDY_ID },
    select: {
      externalId: true,
      artistRank: true,
      artistEloBoost: true,
      eloRating: true,
      category: { select: { name: true } },
    },
  });

  const withRank = verifyItems.filter(i => i.artistRank !== null);
  const withoutRank = verifyItems.filter(i => i.artistRank === null);

  console.log('='.repeat(60));
  console.log('✅ Update Complete!');
  console.log('='.repeat(60));
  console.log(`   Items with artist rank: ${withRank.length}`);
  console.log(`   Items without artist rank: ${withoutRank.length}`);

  // Show ELO distribution
  console.log('\n📊 ELO Distribution by Category:');

  for (const cat of study.categories) {
    const catItems = verifyItems.filter(i => i.category?.name === cat.name);
    if (catItems.length === 0) continue;

    const elos = catItems.map(i => i.eloRating);
    const minElo = Math.min(...elos);
    const maxElo = Math.max(...elos);
    const avgElo = elos.reduce((a, b) => a + b, 0) / elos.length;

    console.log(`   ${cat.name}: min=${minElo.toFixed(1)}, max=${maxElo.toFixed(1)}, avg=${avgElo.toFixed(1)}`);
  }

  console.log();
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
