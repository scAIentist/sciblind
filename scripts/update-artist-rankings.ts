/**
 * Update Artist Rankings and ELO Boosts
 *
 * This script updates artist rankings from an Excel file and recalculates ELO ratings.
 * It preserves all existing voting data while applying new artist boosts.
 *
 * Formula: newElo = (currentElo - oldBoost) + newBoost
 *
 * The boost calculation uses a linear scale:
 * - Rank 1: +200 points
 * - Last rank: +20 points
 * - Formula: boost = 200 - (rank - 1) * (180 / (totalInCategory - 1))
 *
 * Expected Excel format:
 * - Column A: External ID (e.g., "001", "002")
 * - Column B: Category name or number (e.g., "3. razredi")
 * - Column C: Artist rank (1-N, where 1 is best)
 *
 * Run with: npx tsx scripts/update-artist-rankings.ts [excel-file-path]
 * Example:  npx tsx scripts/update-artist-rankings.ts "C:/path/to/ratings.xlsx"
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

// IzVRS Study ID
const IZVRS_STUDY_ID = 'cml808mzc0000m104un333c69';

interface ExcelRow {
  externalId: string;
  categoryName: string;
  artistRank: number;
}

/**
 * Calculate ELO boost based on artist rank within category
 * Linear scale from +200 (rank 1) to +20 (last rank)
 */
function calculateBoost(rank: number, totalInCategory: number): number {
  if (totalInCategory <= 1) return 200;

  // Linear interpolation: rank 1 = 200, rank N = 20
  const boost = 200 - ((rank - 1) * (180 / (totalInCategory - 1)));
  return Math.round(boost * 100) / 100; // Round to 2 decimals
}

/**
 * Parse Excel file and extract rankings
 */
function parseExcel(filePath: string): ExcelRow[] {
  console.log(`📖 Reading Excel file: ${filePath}\n`);

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON as array of arrays (header: 1)
  const rawData = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(worksheet, { header: 1 });

  const rows: ExcelRow[] = [];

  // Skip header row (assume first row is headers)
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length < 3) continue;

    const externalId = String(row[0] ?? '').trim();
    const categoryName = String(row[1] ?? '').trim();
    const artistRank = parseInt(String(row[2] ?? ''), 10);

    if (!externalId || !categoryName || isNaN(artistRank)) {
      console.warn(`  ⚠️ Skipping invalid row ${i + 1}: ${JSON.stringify(row)}`);
      continue;
    }

    rows.push({ externalId, categoryName, artistRank });
  }

  console.log(`  Found ${rows.length} valid rows\n`);
  return rows;
}

async function main() {
  // Get Excel file path from command line
  const excelPath = process.argv[2];

  if (!excelPath) {
    console.error('❌ Error: Please provide path to Excel file');
    console.error('   Usage: npx tsx scripts/update-artist-rankings.ts "path/to/file.xlsx"');
    process.exit(1);
  }

  // Verify file exists
  const absolutePath = path.resolve(excelPath);
  console.log('='.repeat(60));
  console.log('🎨 Update Artist Rankings and ELO Boosts');
  console.log('='.repeat(60));
  console.log();

  // Parse Excel
  const excelRows = parseExcel(absolutePath);

  if (excelRows.length === 0) {
    console.error('❌ No valid rows found in Excel file');
    process.exit(1);
  }

  // Get study categories
  const study = await prisma.study.findUnique({
    where: { id: IZVRS_STUDY_ID },
    include: { categories: true },
  });

  if (!study) {
    console.error(`❌ Study not found: ${IZVRS_STUDY_ID}`);
    process.exit(1);
  }

  console.log(`📚 Study: ${study.title}`);
  console.log(`   Categories: ${study.categories.map(c => c.name).join(', ')}\n`);

  // Build category name to ID mapping (flexible matching)
  const categoryMap = new Map<string, string>();
  for (const cat of study.categories) {
    categoryMap.set(cat.name.toLowerCase(), cat.id);
    // Also map just the number (e.g., "3" -> category ID)
    const match = cat.name.match(/(\d+)/);
    if (match) {
      categoryMap.set(match[1], cat.id);
    }
  }

  // Get all items for the study
  const items = await prisma.item.findMany({
    where: { studyId: IZVRS_STUDY_ID },
    include: { category: true },
  });

  console.log(`📦 Found ${items.length} items in database\n`);

  // Count items per category for boost calculation
  const itemsPerCategory = new Map<string, number>();
  for (const item of items) {
    const count = itemsPerCategory.get(item.categoryId) || 0;
    itemsPerCategory.set(item.categoryId, count + 1);
  }

  // Process each row from Excel
  let updateCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  const updates: Array<{
    item: typeof items[0];
    oldRank: number | null;
    newRank: number;
    oldBoost: number;
    newBoost: number;
    oldElo: number;
    newElo: number;
  }> = [];

  console.log('🔄 Processing updates...\n');

  for (const row of excelRows) {
    // Find matching category
    let categoryId: string | undefined;

    // Try exact match first
    categoryId = categoryMap.get(row.categoryName.toLowerCase());

    // Try extracting number
    if (!categoryId) {
      const match = row.categoryName.match(/(\d+)/);
      if (match) {
        categoryId = categoryMap.get(match[1]);
      }
    }

    if (!categoryId) {
      console.warn(`  ⚠️ Unknown category "${row.categoryName}" for item ${row.externalId}`);
      errorCount++;
      continue;
    }

    // Find matching item
    const item = items.find(
      (i) => i.externalId === row.externalId && i.categoryId === categoryId
    );

    if (!item) {
      console.warn(`  ⚠️ Item not found: ${row.externalId} in category ${row.categoryName}`);
      errorCount++;
      continue;
    }

    // Calculate old and new boost
    const totalInCategory = itemsPerCategory.get(categoryId) || 1;
    const oldBoost = item.artistEloBoost || 0;
    const newBoost = calculateBoost(row.artistRank, totalInCategory);

    // Calculate new ELO: (currentElo - oldBoost) + newBoost
    const baseElo = item.eloRating - oldBoost;
    const newElo = baseElo + newBoost;

    updates.push({
      item,
      oldRank: item.artistRank,
      newRank: row.artistRank,
      oldBoost,
      newBoost,
      oldElo: item.eloRating,
      newElo,
    });
  }

  // Show preview
  console.log('='.repeat(60));
  console.log('📋 Update Preview');
  console.log('='.repeat(60));
  console.log();

  // Group by category for display
  const updatesByCategory = new Map<string, typeof updates>();
  for (const update of updates) {
    const catName = update.item.category?.name || 'Unknown';
    const existing = updatesByCategory.get(catName) || [];
    existing.push(update);
    updatesByCategory.set(catName, existing);
  }

  for (const [catName, catUpdates] of updatesByCategory) {
    console.log(`\n📁 ${catName} (${catUpdates.length} items):`);
    console.log('-'.repeat(50));

    // Sort by new rank
    catUpdates.sort((a, b) => a.newRank - b.newRank);

    for (const u of catUpdates.slice(0, 10)) { // Show first 10
      const rankChange = u.oldRank !== null ? `${u.oldRank} → ${u.newRank}` : `null → ${u.newRank}`;
      const eloChange = `${u.oldElo.toFixed(1)} → ${u.newElo.toFixed(1)}`;
      const boostChange = `boost: ${u.oldBoost.toFixed(1)} → ${u.newBoost.toFixed(1)}`;

      console.log(`  ${u.item.externalId}: rank ${rankChange}, ELO ${eloChange} (${boostChange})`);
    }

    if (catUpdates.length > 10) {
      console.log(`  ... and ${catUpdates.length - 10} more`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Summary:`);
  console.log(`   Updates to apply: ${updates.length}`);
  console.log(`   Errors/Skipped: ${errorCount}`);
  console.log('='.repeat(60));

  // Ask for confirmation (check for --yes flag)
  const autoConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

  if (!autoConfirm) {
    console.log('\n⚠️  This will modify ELO ratings in the database.');
    console.log('   All existing voting data will be preserved.');
    console.log('\n   Run with --yes flag to apply changes:');
    console.log(`   npx tsx scripts/update-artist-rankings.ts "${excelPath}" --yes`);
    console.log();
    await prisma.$disconnect();
    return;
  }

  // Apply updates
  console.log('\n🚀 Applying updates...\n');

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

    if (updateCount % 20 === 0) {
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
      categoryId: true,
    },
    orderBy: [{ categoryId: 'asc' }, { artistRank: 'asc' }],
  });

  // Check that all items now have artist rank
  const missingRank = verifyItems.filter((i) => i.artistRank === null);

  console.log('='.repeat(60));
  console.log('✅ Update Complete!');
  console.log('='.repeat(60));
  console.log(`   Total items updated: ${updateCount}`);
  console.log(`   Items without artist rank: ${missingRank.length}`);

  if (missingRank.length > 0) {
    console.log('\n   Items without artist rank:');
    for (const item of missingRank.slice(0, 5)) {
      console.log(`     - ${item.externalId}`);
    }
    if (missingRank.length > 5) {
      console.log(`     ... and ${missingRank.length - 5} more`);
    }
  }

  // Show ELO distribution per category
  console.log('\n📊 ELO Distribution by Category:');

  for (const cat of study.categories) {
    const catItems = verifyItems.filter((i) => i.categoryId === cat.id);
    if (catItems.length === 0) continue;

    const elos = catItems.map((i) => i.eloRating);
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
