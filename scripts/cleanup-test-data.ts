/**
 * Clean up all test data for IzVRS study
 *
 * This script:
 * 1. Deletes ALL sessions and comparisons
 * 2. Resets ALL item stats and ELO to initial values
 * 3. Resets all access code usage (except marks test code as isTestCode)
 *
 * Run with: npx tsx scripts/cleanup-test-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STUDY_ID = 'cml808mzc0000m104un333c69';
const TEST_CODE = 'IzVRS-TEST-MODE';

async function main() {
  console.log('Cleaning up ALL test data for IzVRS study...\n');

  // 1. Delete all comparisons
  const deletedComparisons = await prisma.comparison.deleteMany({
    where: { studyId: STUDY_ID },
  });
  console.log(`✓ Deleted ${deletedComparisons.count} comparisons`);

  // 2. Delete all sessions
  const deletedSessions = await prisma.session.deleteMany({
    where: { studyId: STUDY_ID },
  });
  console.log(`✓ Deleted ${deletedSessions.count} sessions`);

  // 3. Reset all item stats
  const items = await prisma.item.findMany({
    where: { studyId: STUDY_ID },
  });

  for (const item of items) {
    const initialElo = 1500 + item.artistEloBoost;
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
  }
  console.log(`✓ Reset ${items.length} items to initial state`);

  // 4. Reset all access codes (mark as unused)
  await prisma.accessCode.updateMany({
    where: { studyId: STUDY_ID },
    data: {
      usedAt: null,
      usedBySessionId: null,
    },
  });
  console.log('✓ Reset all access codes to unused');

  // 5. Mark test code as isTestCode
  await prisma.accessCode.updateMany({
    where: {
      studyId: STUDY_ID,
      code: TEST_CODE,
    },
    data: {
      isTestCode: true,
      label: 'TEST MODE - Unlimited uses, no ELO impact',
    },
  });
  console.log('✓ Marked test code as isTestCode: true');

  // 6. Delete usage metrics
  const deletedMetrics = await prisma.usageMetrics.deleteMany({
    where: { studyId: STUDY_ID },
  });
  console.log(`✓ Deleted ${deletedMetrics.count} usage metrics`);

  console.log('\n✓ All data cleaned up! Study is ready for fresh start.');
  console.log('\nAccess codes:');

  const codes = await prisma.accessCode.findMany({
    where: { studyId: STUDY_ID },
    orderBy: { createdAt: 'asc' },
  });

  for (const code of codes) {
    const type = code.isTestCode ? '(TEST - unlimited)' : '(single-use)';
    console.log(`  - ${code.code} ${type}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
