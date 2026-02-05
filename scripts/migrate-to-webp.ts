/**
 * Migrate imageKey references from .png to .webp
 *
 * Run AFTER uploading .webp images to Supabase Storage.
 * Updates all Item records to reference .webp instead of .png.
 *
 * Run with: npx tsx scripts/migrate-to-webp.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Migrating image references from .png to .webp...\n');

  // Find all items with .png imageKey
  const items = await prisma.item.findMany({
    where: {
      imageKey: {
        endsWith: '.png',
      },
    },
    select: {
      id: true,
      imageKey: true,
      externalId: true,
    },
  });

  console.log(`📦 Found ${items.length} items with .png imageKey\n`);

  if (items.length === 0) {
    console.log('✅ No items to migrate. All already using .webp!');
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const item of items) {
    const newKey = item.imageKey!.replace(/\.png$/, '.webp');

    try {
      await prisma.item.update({
        where: { id: item.id },
        data: { imageKey: newKey },
      });

      console.log(`   ✓ Item #${item.externalId || item.id}: ${item.imageKey} → ${newKey}`);
      updated++;
    } catch (err) {
      console.error(`   ✗ Item #${item.externalId || item.id}: Failed to update`, err);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Migration complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
  console.log('='.repeat(50));
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
