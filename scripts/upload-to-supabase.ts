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

  // Note: Bucket must be created manually in Supabase Dashboard first
  // Go to Storage > New bucket > Name: "izvrs-images" > Check "Public bucket"
  console.log(`📦 Using bucket: ${BUCKET_NAME}`);
  console.log('   (Make sure you created this bucket in Supabase Dashboard first)\n');

  let totalUploaded = 0;
  let totalFailed = 0;

  for (const category of CATEGORIES) {
    const localPath = path.join(process.cwd(), 'public', 'uploads', 'izvrs', category.folder);

    if (!fs.existsSync(localPath)) {
      console.log(`⚠️  Skipping ${category.slug}: folder not found at ${localPath}`);
      continue;
    }

    const files = fs.readdirSync(localPath).filter((f) => f.endsWith('.webp') || f.endsWith('.png'));
    console.log(`📁 Uploading ${files.length} images from ${category.slug}...`);

    for (const file of files) {
      const filePath = path.join(localPath, file);
      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `${category.folder}/${file}`;

      process.stdout.write(`   Uploading ${file}...`);

      const contentType = file.endsWith('.webp') ? 'image/webp' : 'image/png';
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType,
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

      console.log(` ✓`);
      totalUploaded++;

      // Store URL for later database update
      const externalId = file.replace(/\.(webp|png)$/, '');
      console.log(`      URL: ${urlData.publicUrl}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Upload complete!`);
  console.log(`   Uploaded: ${totalUploaded}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log('='.repeat(50));

  // Show sample URL format
  console.log(`\n📸 Image URL format: https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images/{category}/{id}.webp`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
