/**
 * Reset all ELO ratings and item stats to pristine state.
 *
 * This script:
 * 1. Resets all items to initial ELO (1500 + artistEloBoost)
 * 2. Resets all game/comparison/win/loss/position counts to 0
 * 3. Deletes ALL comparisons (both test and real)
 * 4. Deletes ALL sessions (both test and real)
 * 5. Reactivates all access codes so they can be used again
 *
 * Run with: npx tsx scripts/reset-elo-ratings.ts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Resetting all ELO ratings and clearing all session data...\n');

  // Step 1: Reset all items to initial state
  const items = await prisma.item.findMany({
    select: { id: true, externalId: true, eloRating: true, eloGames: true, artistEloBoost: true }
  });

  console.log(`📦 Resetting ${items.length} items to initial ELO (1500 + artistEloBoost)...\n`);

  let resetCount = 0;
  for (const item of items) {
    const initialElo = 1500 + (item.artistEloBoost || 0);
    const needsReset = item.eloRating !== initialElo || item.eloGames !== 0;

    if (needsReset) {
      await prisma.item.update({
        where: { id: item.id },
        data: {
          eloRating: initialElo,
          eloGames: 0,
          comparisonCount: 0,
          winCount: 0,
          lossCount: 0,
          leftCount: 0,
          rightCount: 0,
        },
      });
      console.log(`  ✓ Item ${item.externalId}: ${item.eloRating.toFixed(1)} → ${initialElo} (boost: ${item.artistEloBoost})`);
      resetCount++;
    }
  }
  console.log(`\n  Reset ${resetCount} items (${items.length - resetCount} already at initial state)\n`);

  // Step 2: Delete all comparisons
  const compCount = await prisma.comparison.count();
  console.log(`🗑️  Deleting ${compCount} comparisons...`);
  await prisma.comparison.deleteMany({});
  console.log(`  ✓ Deleted all comparisons\n`);

  // Step 3: Delete all usage metrics
  const metricsCount = await prisma.usageMetrics.count();
  console.log(`🗑️  Deleting ${metricsCount} usage metrics...`);
  await prisma.usageMetrics.deleteMany({});
  console.log(`  ✓ Deleted all usage metrics\n`);

  // Step 4: Delete all sessions
  const sessionCount = await prisma.session.count();
  console.log(`🗑️  Deleting ${sessionCount} sessions...`);
  await prisma.session.deleteMany({});
  console.log(`  ✓ Deleted all sessions\n`);

  // Step 5: Reactivate all access codes
  const codes = await prisma.accessCode.updateMany({
    data: {
      usedAt: null,
      usedBySessionId: null,
    },
  });
  console.log(`🔑 Reactivated ${codes.count} access codes\n`);

  // Verify
  const verifyItems = await prisma.item.findMany({
    where: { OR: [{ eloGames: { gt: 0 } }, { comparisonCount: { gt: 0 } }] }
  });
  const verifyComps = await prisma.comparison.count();
  const verifySessions = await prisma.session.count();

  console.log('='.repeat(50));
  console.log('✅ Reset complete!');
  console.log(`  Items with non-zero stats: ${verifyItems.length} (should be 0)`);
  console.log(`  Remaining comparisons: ${verifyComps} (should be 0)`);
  console.log(`  Remaining sessions: ${verifySessions} (should be 0)`);
  console.log('='.repeat(50));
}

main()
  .catch((e) => {
    console.error('❌ Reset failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
