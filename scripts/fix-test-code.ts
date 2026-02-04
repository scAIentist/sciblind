/**
 * Fix test access code for IzVRS study
 *
 * This script:
 * 1. Marks the test code as isTestCode: true
 * 2. Finds and deletes all comparisons from test sessions
 * 3. Reverts ELO changes from those comparisons
 * 4. Marks existing test sessions as isTestSession: true
 *
 * Run with: npx tsx scripts/fix-test-code.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STUDY_ID = 'cml808mzc0000m104un333c69';
const TEST_CODE = 'IzVRS-TEST-MODE';

async function main() {
  console.log('Fixing test access code and cleaning up test data...\n');

  // 1. Find and update the test code
  const testCode = await prisma.accessCode.findFirst({
    where: {
      studyId: STUDY_ID,
      code: TEST_CODE,
    },
  });

  if (!testCode) {
    console.log('❌ Test code not found');
    return;
  }

  // Mark as test code
  await prisma.accessCode.update({
    where: { id: testCode.id },
    data: {
      isTestCode: true,
      usedAt: null,
      usedBySessionId: null,
      label: 'TEST MODE - Unlimited uses, no ELO impact',
    },
  });
  console.log('✓ Test code marked as isTestCode: true');

  // 2. Find the session that used this code (if any)
  const testSession = await prisma.session.findFirst({
    where: {
      studyId: STUDY_ID,
      accessCode: {
        code: TEST_CODE,
      },
    },
    include: {
      comparisons: {
        include: {
          itemA: true,
          itemB: true,
        },
      },
    },
  });

  // Also find any sessions that might have been created with test mode
  // (they would have ipHash from the same testing)
  const allTestSessions = await prisma.session.findMany({
    where: {
      studyId: STUDY_ID,
      OR: [
        { isTestSession: true },
        // Find sessions linked to test code
        { accessCode: { code: TEST_CODE } },
      ],
    },
    include: {
      comparisons: {
        include: {
          itemA: true,
          itemB: true,
        },
      },
    },
  });

  console.log(`\nFound ${allTestSessions.length} test session(s)`);

  // 3. Revert ELO changes and delete comparisons
  for (const session of allTestSessions) {
    console.log(`\nProcessing session ${session.id} (${session.comparisons.length} comparisons)`);

    for (const comparison of session.comparisons) {
      const winner = comparison.winnerId === comparison.itemAId ? comparison.itemA : comparison.itemB;
      const loser = comparison.winnerId === comparison.itemAId ? comparison.itemB : comparison.itemA;

      // Revert winner stats (decrease wins, games, counts)
      await prisma.item.update({
        where: { id: winner.id },
        data: {
          eloGames: { decrement: 1 },
          comparisonCount: { decrement: 1 },
          winCount: { decrement: 1 },
          leftCount:
            comparison.leftItemId === winner.id ? { decrement: 1 } : undefined,
          rightCount:
            comparison.rightItemId === winner.id ? { decrement: 1 } : undefined,
        },
      });

      // Revert loser stats
      await prisma.item.update({
        where: { id: loser.id },
        data: {
          eloGames: { decrement: 1 },
          comparisonCount: { decrement: 1 },
          lossCount: { decrement: 1 },
          leftCount:
            comparison.leftItemId === loser.id ? { decrement: 1 } : undefined,
          rightCount:
            comparison.rightItemId === loser.id ? { decrement: 1 } : undefined,
        },
      });

      console.log(`  Reverted stats for comparison ${comparison.id}`);
    }

    // Delete all comparisons from this session
    const deleted = await prisma.comparison.deleteMany({
      where: { sessionId: session.id },
    });
    console.log(`  Deleted ${deleted.count} comparisons`);

    // Delete the test session itself
    await prisma.session.delete({
      where: { id: session.id },
    });
    console.log(`  Deleted session ${session.id}`);
  }

  // 4. Reset ELO ratings for affected items back to their initial values
  // (artist boost + base 1500)
  console.log('\nResetting ELO ratings to initial values...');

  const items = await prisma.item.findMany({
    where: { studyId: STUDY_ID },
  });

  for (const item of items) {
    const initialElo = 1500 + item.artistEloBoost;
    if (item.eloRating !== initialElo) {
      await prisma.item.update({
        where: { id: item.id },
        data: { eloRating: initialElo },
      });
    }
  }
  console.log(`✓ Reset ${items.length} items to initial ELO ratings`);

  // 5. Delete any usage metrics from test sessions
  // (We don't have session IDs in metrics, so we'll just leave them)

  console.log('\n✓ All test data cleaned up!');
  console.log(`\nTest code: ${TEST_CODE}`);
  console.log('This code can now be used unlimited times without affecting rankings.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
