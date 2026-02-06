/**
 * Add comparisonMode column to Study table and update IzVRS to quad mode
 *
 * Run with: npx tsx scripts/add-comparison-mode-column.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STUDY_ID = 'cml808mzc0000m104un333c69';

async function main() {
  console.log('Adding comparisonMode column to Study table...\n');

  try {
    // Add column if it doesn't exist
    await prisma.$executeRaw`
      ALTER TABLE "Study"
      ADD COLUMN IF NOT EXISTS "comparisonMode" TEXT NOT NULL DEFAULT 'pair'
    `;
    console.log('✓ Column added (or already exists)');

    // Update IzVRS study to quad mode
    await prisma.$executeRaw`
      UPDATE "Study"
      SET "comparisonMode" = 'quad'
      WHERE id = ${STUDY_ID}
    `;
    console.log('✓ IzVRS study updated to quad mode');

    // Verify
    const result = await prisma.$queryRaw`
      SELECT id, title, "comparisonMode" FROM "Study" WHERE id = ${STUDY_ID}
    `;
    console.log('\nVerification:', result);

  } catch (error) {
    console.error('Error:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
