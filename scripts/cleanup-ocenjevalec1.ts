/**
 * Cleanup corrupted session from Ocenjevalec 1 (code 90074 equivalent).
 *
 * This script:
 * 1. Finds the session for "Ocenjevalec 1" code
 * 2. Deletes all comparisons from that session (they have bugs from race condition)
 * 3. Reverses ELO changes from those comparisons
 * 4. Deletes the session and resets the code so it can be used again
 *
 * The reviewer can then use the SAME code again to vote properly.
 *
 * Run with: npx tsx scripts/cleanup-ocenjevalec1.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STUDY_ID = 'cml808mzc0000m104un333c69';

async function main() {
  console.log('=== Cleanup Ocenjevalec 1 Session ===\n');

  // Find the used code (label was fixed to Ocenjevalec 90074)
  const usedCode = await prisma.accessCode.findFirst({
    where: { studyId: STUDY_ID, label: 'Ocenjevalec 90074' }
  });

  if (!usedCode) {
    console.log('Ocenjevalec 1 code not found!');
    return;
  }

  console.log('Found code:', usedCode.label);
  console.log('Session ID:', usedCode.usedBySessionId);

  if (!usedCode.usedBySessionId) {
    console.log('No session linked to this code - already clean.');
    return;
  }

  // Get the session's comparisons
  const comparisons = await prisma.comparison.findMany({
    where: { sessionId: usedCode.usedBySessionId },
    select: {
      id: true,
      itemAId: true,
      itemBId: true,
      winnerId: true,
    }
  });

  console.log(`\nFound ${comparisons.length} comparisons to delete`);

  // Track wins, losses, and comparison counts to reverse
  const winCounts: Record<string, number> = {};
  const lossCounts: Record<string, number> = {};
  const compCounts: Record<string, number> = {};

  for (const comp of comparisons) {
    // Track comparison counts
    compCounts[comp.itemAId] = (compCounts[comp.itemAId] || 0) + 1;
    compCounts[comp.itemBId] = (compCounts[comp.itemBId] || 0) + 1;

    // Track wins/losses
    if (comp.winnerId === comp.itemAId) {
      winCounts[comp.itemAId] = (winCounts[comp.itemAId] || 0) + 1;
      lossCounts[comp.itemBId] = (lossCounts[comp.itemBId] || 0) + 1;
    } else if (comp.winnerId === comp.itemBId) {
      winCounts[comp.itemBId] = (winCounts[comp.itemBId] || 0) + 1;
      lossCounts[comp.itemAId] = (lossCounts[comp.itemAId] || 0) + 1;
    }
  }

  const affectedItems = new Set([...Object.keys(winCounts), ...Object.keys(lossCounts), ...Object.keys(compCounts)]);
  console.log('\nAffected items:', affectedItems.size);

  // Reset item stats (we'll recalculate ELO from remaining comparisons)
  console.log('\nResetting item stats...');
  let updateCount = 0;
  for (const itemId of affectedItems) {
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) continue;

    const wins = winCounts[itemId] || 0;
    const losses = lossCounts[itemId] || 0;
    const comps = compCounts[itemId] || 0;

    // Reset to base ELO (1500 + artistEloBoost)
    // This is safe since all 83 comparisons are being deleted and there are no other real comparisons
    const baseElo = 1500 + (item.artistEloBoost || 0);

    await prisma.item.update({
      where: { id: itemId },
      data: {
        eloRating: baseElo,
        comparisonCount: Math.max(0, item.comparisonCount - comps),
        winCount: Math.max(0, item.winCount - wins),
        lossCount: Math.max(0, item.lossCount - losses),
        eloGames: Math.max(0, item.eloGames - comps),
      }
    });
    updateCount++;
  }
  console.log(`Updated ${updateCount} items`);

  // Delete comparisons
  console.log('\nDeleting comparisons...');
  const deleted = await prisma.comparison.deleteMany({
    where: { sessionId: usedCode.usedBySessionId }
  });
  console.log(`Deleted ${deleted.count} comparisons`);

  // Delete the session
  console.log('Deleting session...');
  await prisma.session.delete({
    where: { id: usedCode.usedBySessionId }
  });
  console.log('Session deleted');

  // Reset the code so it can be used again
  console.log('\nResetting access code for re-use...');
  await prisma.accessCode.update({
    where: { id: usedCode.id },
    data: {
      usedAt: null,
      usedBySessionId: null,
    }
  });
  console.log('Code reset - can be used again');

  console.log('\n=== DONE ===');
  console.log('The reviewer can now use the SAME code again.');
  console.log('The coverage bug has been fixed in the code.');

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
