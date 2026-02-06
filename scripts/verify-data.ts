/**
 * Verify algorithm correctness and data persistence
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const studyId = 'cml808mzc0000m104un333c69';

async function verify() {
  // Get study
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    include: { categories: true },
  });

  console.log('=== STUDY INFO ===');
  console.log('Title:', study?.title);
  console.log('Categories:', study?.categories.map(c => c.name).join(', '));

  // Count comparisons by type
  const totalComparisons = await prisma.comparison.count({
    where: { studyId },
  });

  const testComparisons = await prisma.comparison.count({
    where: { studyId, flagReason: 'test_session' },
  });

  const realComparisons = totalComparisons - testComparisons;

  console.log('\n=== COMPARISONS ===');
  console.log('Total comparisons:', totalComparisons);
  console.log('Test comparisons:', testComparisons);
  console.log('Real comparisons:', realComparisons);

  // Sessions
  const sessions = await prisma.session.findMany({
    where: { studyId },
    select: { id: true, isTestSession: true, isCompleted: true, comparisonCount: true },
  });

  const testSessions = sessions.filter(s => s.isTestSession);
  const realSessions = sessions.filter(s => !s.isTestSession);

  console.log('\n=== SESSIONS ===');
  console.log('Total sessions:', sessions.length);
  console.log('Test sessions:', testSessions.length);
  console.log('Real sessions:', realSessions.length);
  console.log('Completed real sessions:', realSessions.filter(s => s.isCompleted).length);

  // Sample items with ELO
  const items = await prisma.item.findMany({
    where: { studyId },
    orderBy: { eloRating: 'desc' },
    take: 10,
    include: { category: true },
  });

  console.log('\n=== TOP 10 ITEMS BY ELO ===');
  items.forEach((item, idx) => {
    console.log(`${idx + 1}. ID:${item.externalId} ELO:${Math.round(item.eloRating)} Games:${item.eloGames} Wins:${item.winCount} (${item.category?.name})`);
  });

  // Check for items with 0 games
  const zeroGamesItems = await prisma.item.count({
    where: { studyId, eloGames: 0 },
  });
  const totalItems = await prisma.item.count({
    where: { studyId },
  });

  console.log('\n=== COVERAGE ===');
  console.log('Total items:', totalItems);
  console.log('Items with 0 games:', zeroGamesItems);
  console.log('Items with games:', totalItems - zeroGamesItems);

  await prisma.$disconnect();
}

verify().catch(console.error);
