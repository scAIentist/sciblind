/**
 * Fix access code labels to match their actual code values
 *
 * This ensures traceability between the code a reviewer uses and the database record.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The codes from IzVRS-Study-Links.txt with correct labels
const codeLabels: Record<string, string> = {
  'IzVRS-ocenjevalec90074': 'Ocenjevalec 90074',
  'IzVRS-ocenjevalec25793': 'Ocenjevalec 25793',
  'IzVRS-ocenjevalec85642': 'Ocenjevalec 85642',
  'IzVRS-ocenjevalec95696': 'Ocenjevalec 95696',
  'IzVRS-ocenjevalec86339': 'Ocenjevalec 86339',
  'IzVRS-ocenjevalec36430': 'Ocenjevalec 36430',
  'IzVRS-ocenjevalec98370': 'Ocenjevalec 98370',
  'IzVRS-ocenjevalec14944': 'Ocenjevalec 14944',
  'IzVRS-ocenjevalec29621': 'Ocenjevalec 29621',
  'IzVRS-TEST-MODE': 'TEST MODE (unlimited, no ELO impact)',
};

async function main() {
  console.log('=== Fixing Access Code Labels ===\n');

  // Build hash -> label mapping
  const hashToLabel: Record<string, string> = {};
  for (const [code, label] of Object.entries(codeLabels)) {
    const hash = crypto.createHash('sha256').update(code.trim()).digest('hex');
    hashToLabel[hash] = label;
  }

  // Get all codes for this study
  const dbCodes = await prisma.accessCode.findMany({
    where: { studyId: 'cml808mzc0000m104un333c69' },
    select: { id: true, label: true, codeHash: true }
  });

  let updated = 0;
  for (const dbCode of dbCodes) {
    const expectedLabel = hashToLabel[dbCode.codeHash];
    if (expectedLabel && dbCode.label !== expectedLabel) {
      console.log(`Updating: "${dbCode.label}" -> "${expectedLabel}"`);
      await prisma.accessCode.update({
        where: { id: dbCode.id },
        data: { label: expectedLabel }
      });
      updated++;
    } else if (!expectedLabel) {
      console.log(`Unknown hash: ${dbCode.codeHash.slice(0, 16)} (label: ${dbCode.label})`);
    }
  }

  console.log(`\nUpdated ${updated} code labels`);

  // Verify
  console.log('\n=== Verification ===\n');
  const verifyC = await prisma.accessCode.findMany({
    where: { studyId: 'cml808mzc0000m104un333c69' },
    select: { label: true, codeHash: true, usedAt: true },
    orderBy: { createdAt: 'asc' }
  });

  for (const c of verifyC) {
    const status = c.usedAt ? '[USED]' : '[AVAILABLE]';
    console.log(`${status} ${c.label}`);
  }

  await prisma.$disconnect();
}

main();
