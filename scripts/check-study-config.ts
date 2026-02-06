import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const study = await prisma.study.findFirst({
    include: {
      categories: {
        orderBy: { displayOrder: 'asc' },
        include: { _count: { select: { items: true } } }
      },
      _count: { select: { items: true, sessions: true, comparisons: true, accessCodes: true } }
    }
  });

  if (!study) {
    console.log('No study found!');
    return;
  }

  console.log('=== STUDY CONFIG ===');
  console.log(`Title: ${study.title}`);
  console.log(`ID: ${study.id}`);
  console.log(`ELO K-factor: ${study.eloKFactor}`);
  console.log(`Adaptive K: ${study.adaptiveKFactor}`);
  console.log(`Min exposures per item: ${study.minExposuresPerItem}`);
  console.log(`Min total comparisons: ${study.minTotalComparisons}`);
  console.log(`Allow continued voting: ${study.allowContinuedVoting}`);
  console.log(`Has category separation: ${study.hasCategorySeparation}`);
  console.log(`comparisonsPerParticipant: ${study.comparisonsPerParticipant}`);
  console.log(`Total items: ${study._count.items}`);
  console.log(`Total sessions: ${study._count.sessions}`);
  console.log(`Total comparisons: ${study._count.comparisons}`);
  console.log(`Access codes: ${study._count.accessCodes}`);

  console.log('\n=== CATEGORIES ===');
  for (const cat of study.categories) {
    console.log(`  ${cat.name} (${cat.slug}): ${cat._count.items} items, order=${cat.displayOrder}`);
  }

  // Check access codes
  const codes = await prisma.accessCode.findMany({
    where: { studyId: study.id },
    select: { code: true, label: true, isTestCode: true, isActive: true, usedAt: true }
  });
  console.log('\n=== ACCESS CODES ===');
  for (const c of codes) {
    console.log(`  ${c.label}: test=${c.isTestCode} active=${c.isActive} used=${c.usedAt ? 'YES' : 'no'}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
