/**
 * Update IzVRS study settings:
 * - allowContinuedVoting = false (stop at scientific threshold)
 * - uiShowCounts = true (show X/Y counter alongside progress bar)
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const IZVRS_STUDY_ID = 'cml808mzc0000m104un333c69';

async function main() {
  const study = await prisma.study.findUnique({
    where: { id: IZVRS_STUDY_ID },
    select: { id: true, title: true, allowContinuedVoting: true, uiShowCounts: true },
  });

  if (!study) {
    console.error('IzVRS study not found!');
    return;
  }

  console.log(`Found: ${study.title}`);
  console.log(`  Before: allowContinuedVoting=${study.allowContinuedVoting}, uiShowCounts=${study.uiShowCounts}`);

  await prisma.study.update({
    where: { id: IZVRS_STUDY_ID },
    data: {
      allowContinuedVoting: false,
      uiShowCounts: true,
    },
  });

  console.log(`  After: allowContinuedVoting=false, uiShowCounts=true`);
  console.log('Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
