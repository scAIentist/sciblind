import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Real session comparisons
  const realComps = await prisma.comparison.findMany({
    where: { session: { isTestSession: false } },
    select: { id: true, itemAId: true, itemBId: true, winnerId: true, categoryId: true, sessionId: true }
  });
  console.log(`=== REAL SESSION COMPARISONS: ${realComps.length} ===`);

  // Find unique items affected by real voting
  const realItemIds = new Set<string>();
  for (const c of realComps) {
    realItemIds.add(c.itemAId);
    realItemIds.add(c.itemBId);
  }
  console.log(`Items affected by real voting: ${realItemIds.size}`);

  // Get those items
  const affectedItems = await prisma.item.findMany({
    where: { id: { in: Array.from(realItemIds) } },
    select: { id: true, externalId: true, eloRating: true, eloGames: true, comparisonCount: true, winCount: true, lossCount: true, leftCount: true, rightCount: true, categoryId: true, artistRank: true, artistEloBoost: true }
  });

  console.log('\n=== ITEMS WITH REAL VOTING STATS ===');
  for (const i of affectedItems) {
    console.log(`  ${i.externalId}: elo=${i.eloRating} games=${i.eloGames} comp=${i.comparisonCount} w=${i.winCount} l=${i.lossCount} left=${i.leftCount} right=${i.rightCount} artistRank=${i.artistRank} boost=${i.artistEloBoost}`);
  }

  // Check items with non-1500 ELO but games=0 (these are from seed, not voting)
  const seedModified = await prisma.item.findMany({
    where: { eloRating: { not: 1500 }, eloGames: 0 },
    select: { id: true, externalId: true, eloRating: true, artistRank: true, artistEloBoost: true, categoryId: true }
  });
  console.log(`\n=== ITEMS WITH SEED-MODIFIED ELO (games=0): ${seedModified.length} ===`);
  for (const i of seedModified) {
    console.log(`  ${i.externalId}: elo=${i.eloRating} artistRank=${i.artistRank} boost=${i.artistEloBoost}`);
  }

  // The real session
  const realSession = await prisma.session.findFirst({
    where: { isTestSession: false },
    select: { id: true, comparisonCount: true, accessCode: true, createdAt: true }
  });
  console.log(`\n=== REAL SESSION ===`);
  console.log(JSON.stringify(realSession, null, 2));

  // Check how many items total
  const totalItems = await prisma.item.count();
  console.log(`\nTotal items: ${totalItems}`);

  // Check study eloKFactor
  const study = await prisma.study.findFirst({
    select: { id: true, eloKFactor: true, adaptiveKFactor: true }
  });
  console.log(`Study K-factor: ${study?.eloKFactor}, adaptive: ${study?.adaptiveKFactor}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
