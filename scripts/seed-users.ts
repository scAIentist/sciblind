/**
 * Seed Initial Users
 *
 * Creates:
 * 1. Super admin account (your account)
 * 2. IzVRS user account (info@izvrs.si) with password reset required
 * 3. Assigns IzVRS study to the IzVRS user and marks it as legacy
 *
 * Usage: npx tsx scripts/seed-users.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function generateResetToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

async function main() {
  console.log('Seeding users...\n');

  // 1. Create super admin account
  const superAdminEmail = 'luka@scaientist.eu';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMeNow123!';

  let superAdmin = await prisma.user.findUnique({ where: { email: superAdminEmail } });

  if (!superAdmin) {
    superAdmin = await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash: await hashPassword(superAdminPassword),
        name: 'Luka (Super Admin)',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });
    console.log(`✓ Created super admin: ${superAdminEmail}`);
    console.log(`  Password: ${superAdminPassword}`);
    console.log('  ⚠️  Change this password immediately!\n');
  } else {
    console.log(`✓ Super admin already exists: ${superAdminEmail}\n`);
  }

  // 2. Create IzVRS user account with password reset token
  const izvrsEmail = 'info@izvrs.si';

  let izvrsUser = await prisma.user.findUnique({ where: { email: izvrsEmail } });

  if (!izvrsUser) {
    const resetToken = generateResetToken();
    const resetTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    izvrsUser = await prisma.user.create({
      data: {
        email: izvrsEmail,
        passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')), // Random unguessable password
        name: 'IzVRS',
        role: 'USER',
        isActive: true,
        resetToken,
        resetTokenExpiry,
      },
    });
    console.log(`✓ Created IzVRS user: ${izvrsEmail}`);
    console.log(`  Reset token: ${resetToken}`);
    console.log(`  Reset link: https://blind.scaientist.eu/admin/reset-password?token=${resetToken}`);
    console.log('  Token expires in 30 days\n');
  } else {
    console.log(`✓ IzVRS user already exists: ${izvrsEmail}\n`);
  }

  // 3. Find and update the IzVRS study
  const izvrsStudyId = 'cml808mzc0000m104un333c69';

  const study = await prisma.study.findUnique({
    where: { id: izvrsStudyId },
    select: { id: true, title: true, ownerId: true, isLegacy: true },
  });

  if (study) {
    await prisma.study.update({
      where: { id: izvrsStudyId },
      data: {
        ownerId: izvrsUser.id,
        isLegacy: true,
        createdBy: izvrsEmail, // Update createdBy for audit
      },
    });
    console.log(`✓ Updated IzVRS study:`);
    console.log(`  ID: ${izvrsStudyId}`);
    console.log(`  Title: ${study.title}`);
    console.log(`  Owner: ${izvrsEmail}`);
    console.log(`  Legacy: true (only visible to owner and superadmins)\n`);
  } else {
    console.log(`⚠ IzVRS study not found: ${izvrsStudyId}\n`);
  }

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nUsers created:`);
  console.log(`  1. ${superAdminEmail} (SUPER_ADMIN)`);
  console.log(`  2. ${izvrsEmail} (USER) - needs password reset`);
  console.log(`\nIzVRS study marked as legacy and assigned to ${izvrsEmail}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Change super admin password after first login`);
  console.log(`  2. Send reset link to IzVRS: https://blind.scaientist.eu/admin/reset-password?token=${izvrsUser.resetToken || '[already exists]'}`);
  console.log(`  3. Deploy updated auth system`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
