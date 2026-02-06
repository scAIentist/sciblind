/**
 * Update IzVRS study to use quadruplet comparison mode
 * This halves the voting time while maintaining scientific reliability.
 *
 * Run with: npx tsx scripts/update-izvrs-quad.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STUDY_ID = 'cml808mzc0000m104un333c69';

async function main() {
  console.log('Updating IzVRS study to quadruplet mode...\n');

  const study = await prisma.study.findUnique({
    where: { id: STUDY_ID },
    select: { id: true, title: true, comparisonMode: true },
  });

  if (!study) {
    console.error('Study not found!');
    return;
  }

  console.log('Current study:', study.title);
  console.log('Current mode:', study.comparisonMode || 'pair (default)');

  const updated = await prisma.study.update({
    where: { id: STUDY_ID },
    data: { comparisonMode: 'quad' },
  });

  console.log('\n✓ Updated to quadruplet mode!');
  console.log('New mode:', updated.comparisonMode);
  console.log('\nQuadruplet mode shows 4 images at once.');
  console.log('User picks the best 1, generating 3 pairwise wins.');
  console.log('This reduces voting time by ~50% while maintaining scientific reliability.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
