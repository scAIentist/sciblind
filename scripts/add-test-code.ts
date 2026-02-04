/**
 * Add test access code for IzVRS study
 * This code can be used multiple times for testing
 *
 * Run with: npx tsx scripts/add-test-code.ts
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const STUDY_ID = 'cml808mzc0000m104un333c69';
const TEST_CODE = 'IzVRS-TEST-MODE';

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function main() {
  console.log('Adding test access code...\n');

  // Check if test code already exists
  const existing = await prisma.accessCode.findFirst({
    where: {
      studyId: STUDY_ID,
      code: TEST_CODE,
    },
  });

  if (existing) {
    // Reset the test code so it can be used again
    await prisma.accessCode.update({
      where: { id: existing.id },
      data: {
        usedAt: null,
        usedBySessionId: null,
        isActive: true,
      },
    });
    console.log('✓ Test code reset (can be used again)');
  } else {
    // Create new test code
    await prisma.accessCode.create({
      data: {
        studyId: STUDY_ID,
        code: TEST_CODE,
        codeHash: hashCode(TEST_CODE),
        label: 'TEST MODE - Multiple uses allowed',
        isActive: true,
      },
    });
    console.log('✓ Test code created');
  }

  console.log(`\nTest code: ${TEST_CODE}`);
  console.log('\nNote: To test again, run this script to reset the code.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
