/**
 * Update IzVRS Study Title and Description
 *
 * Run with: npx tsx scripts/update-study-text.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STUDY_ID = 'cml808mzc0000m104un333c69';

async function main() {
  console.log('Updating IzVRS study text...');

  const study = await prisma.study.update({
    where: { id: STUDY_ID },
    data: {
      title: 'IzVRS Likovni natečaj 2025',
      description: 'Slepo primerjanje likovnih del učencev za izbor najboljših 12, ki bodo natisnjeni na sledilnikih. Pomagajte nam pri izboru!',
    },
  });

  console.log('Study updated successfully:');
  console.log(`  Title: ${study.title}`);
  console.log(`  Description: ${study.description}`);
}

main()
  .catch((e) => {
    console.error('Error updating study:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
