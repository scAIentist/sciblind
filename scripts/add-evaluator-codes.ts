/**
 * Add new evaluator access codes for IzVRS study
 *
 * Run with: npx tsx scripts/add-evaluator-codes.ts
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const STUDY_ID = 'cml808mzc0000m104un333c69';

// Generate random 5-digit suffix
function randomSuffix(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function main() {
  console.log('Adding new evaluator access codes for IzVRS study...\n');

  const newCodes = [
    `IzVRS-ocenjevalec${randomSuffix()}`,
    `IzVRS-ocenjevalec${randomSuffix()}`,
  ];

  for (const code of newCodes) {
    // Check if code already exists (unlikely with random suffix)
    const existing = await prisma.accessCode.findFirst({
      where: { studyId: STUDY_ID, code },
    });

    if (existing) {
      console.log(`⚠ Code ${code} already exists, skipping`);
      continue;
    }

    await prisma.accessCode.create({
      data: {
        studyId: STUDY_ID,
        code,
        codeHash: hashCode(code),
        label: 'Evaluator',
        isActive: true,
        isTestCode: false,
      },
    });

    console.log(`✓ Created: ${code}`);
  }

  // List all active codes
  console.log('\n--- All active access codes ---\n');
  const allCodes = await prisma.accessCode.findMany({
    where: { studyId: STUDY_ID, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const ac of allCodes) {
    const status = ac.usedAt ? `Used at ${ac.usedAt.toISOString()}` : 'Available';
    const testLabel = ac.isTestCode ? ' [TEST]' : '';
    console.log(`  ${ac.code}${testLabel} - ${status}`);
  }

  console.log(`\nTotal: ${allCodes.length} codes (${allCodes.filter(c => !c.usedAt).length} available)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
