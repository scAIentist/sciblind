import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find all test sessions
  const testSessions = await prisma.session.findMany({
    where: { isTestSession: true },
    select: { id: true, comparisonCount: true, createdAt: true, accessCode: true }
  });
  console.log('=== TEST SESSIONS ===');
  console.log(JSON.stringify(testSessions, null, 2));

  // Find all comparisons from test sessions
  const testComps = await prisma.comparison.findMany({
    where: { session: { isTestSession: true } },
    select: { id: true, sessionId: true, winnerId: true, itemAId: true, itemBId: true, isFlagged: true, flagReason: true, algoVersion: true }
  });
  console.log(`\n=== TEST COMPARISONS: ${testComps.length} ===`);
  const unflagged = testComps.filter(c => !c.isFlagged || c.flagReason !== 'test_session');
  console.log(`Unflagged test comparisons (ELO was updated for these!): ${unflagged.length}`);
  if (unflagged.length > 0) {
    console.log(JSON.stringify(unflagged, null, 2));
  }

  // Items with non-default ELO
  const modified = await prisma.item.findMany({
    where: { OR: [{ eloRating: { not: 1500 } }, { eloGames: { gt: 0 } }] },
    select: { id: true, externalId: true, eloRating: true, eloGames: true, comparisonCount: true, winCount: true, lossCount: true, leftCount: true, rightCount: true, categoryId: true },
    orderBy: { eloRating: 'desc' }
  });
  console.log(`\n=== MODIFIED ITEMS (non-default ELO): ${modified.length} ===`);
  for (const i of modified) {
    console.log(`  ${i.externalId}: elo=${i.eloRating} games=${i.eloGames} comp=${i.comparisonCount} w=${i.winCount} l=${i.lossCount} left=${i.leftCount} right=${i.rightCount}`);
  }

  // All sessions
  const allSessions = await prisma.session.findMany({
    select: { id: true, isTestSession: true, comparisonCount: true, accessCode: true, createdAt: true }
  });
  console.log(`\n=== ALL SESSIONS: ${allSessions.length} ===`);
  for (const s of allSessions) {
    console.log(`  ${s.id} test=${s.isTestSession} comps=${s.comparisonCount} code=${s.accessCode} created=${s.createdAt.toISOString()}`);
  }

  // All comparisons count
  const totalComps = await prisma.comparison.count();
  const testCompCount = await prisma.comparison.count({ where: { session: { isTestSession: true } } });
  const realCompCount = await prisma.comparison.count({ where: { session: { isTestSession: false } } });
  console.log(`\n=== COMPARISON SUMMARY ===`);
  console.log(`Total: ${totalComps}, Test: ${testCompCount}, Real: ${realCompCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
