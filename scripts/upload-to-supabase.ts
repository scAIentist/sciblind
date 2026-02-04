/**
 * Upload IzVRS images to Supabase Storage
 *
 * Prerequisites:
 * 1. Create a bucket called 'izvrs-images' in Supabase Storage
 * 2. Set the bucket to public (or configure RLS policies)
 * 3. Get your Supabase anon key from Project Settings > API
 *
 * Run with: npx tsx scripts/upload-to-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Supabase configuration
const SUPABASE_URL = 'https://rdsozrebfjjoknqonvbk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const BUCKET_NAME = 'izvrs-images';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const prisma = new PrismaClient();

const CATEGORIES = [
  { slug: '3-razredi', folder: '3-razredi' },
  { slug: '4-razredi', folder: '4-razredi' },
  { slug: '5-razredi', folder: '5-razredi' },
];

async function main() {
  if (!SUPABASE_ANON_KEY) {
    console.error('❌ Please set SUPABASE_ANON_KEY environment variable');
    console.log('   Get it from: Supabase Dashboard > Project Settings > API > anon public');
    process.exit(1);
  }

  console.log('🚀 Starting upload to Supabase Storage...\n');

  // Check if bucket exists
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    console.error('❌ Failed to list buckets:', bucketsError.message);
    process.exit(1);
  }

  const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME);
  if (!bucketExists) {
    console.log(`📦 Creating bucket: ${BUCKET_NAME}`);
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
    });
    if (createError) {
      console.error('❌ Failed to create bucket:', createError.message);
      console.log('   Please create the bucket manually in Supabase Dashboard');
      process.exit(1);
    }
  }

  let totalUploaded = 0;
  let totalFailed = 0;

  for (const category of CATEGORIES) {
    const localPath = path.join(process.cwd(), 'public', 'uploads', 'izvrs', category.folder);

    if (!fs.existsSync(localPath)) {
      console.log(`⚠️  Skipping ${category.slug}: folder not found at ${localPath}`);
      continue;
    }

    const files = fs.readdirSync(localPath).filter((f) => f.endsWith('.png'));
    console.log(`📁 Uploading ${files.length} images from ${category.slug}...`);

    for (const file of files) {
      const filePath = path.join(localPath, file);
      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `${category.folder}/${file}`;

      process.stdout.write(`   Uploading ${file}...`);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.log(` ❌ ${uploadError.message}`);
        totalFailed++;
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);

      // Update database
      const externalId = file.replace('.png', '');
      await prisma.item.updateMany({
        where: {
          externalId,
          imageKey: `izvrs/${category.folder}/${file}`,
        },
        data: {
          imageUrl: urlData.publicUrl,
        },
      });

      console.log(` ✓`);
      totalUploaded++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Upload complete!`);
  console.log(`   Uploaded: ${totalUploaded}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log('='.repeat(50));

  // Show sample URL
  const sampleItem = await prisma.item.findFirst({
    where: { imageUrl: { not: null } },
  });
  if (sampleItem?.imageUrl) {
    console.log(`\n📸 Sample image URL: ${sampleItem.imageUrl}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
