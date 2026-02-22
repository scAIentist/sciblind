/**
 * User Authentication
 *
 * Multi-user authentication system with email/password.
 * Supports both the legacy ADMIN_SECRET (for migration) and new user-based auth.
 *
 * Users can be:
 * - SUPER_ADMIN: Can see all studies, manage users
 * - USER: Can only see their own studies
 *
 * Password reset flow:
 * 1. User requests reset via email
 * 2. System generates resetToken and resetTokenExpiry
 * 3. User clicks link with token
 * 4. User sets new password, token is cleared
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { User, UserRole } from '@prisma/client';

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SESSION_EXPIRY_DAYS = 7;
const BCRYPT_ROUNDS = 12;

// Type for authenticated user context
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a secure random token
 */
export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a password reset token (shorter, URL-safe)
 */
export function generateResetToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Create a new admin session for a user
 */
export async function createAdminSession(userId: string, request?: NextRequest): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.adminSession.create({
    data: {
      userId,
      token,
      expiresAt,
      userAgent: request?.headers.get('user-agent') || null,
      ipHash: request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ? crypto.createHash('sha256').update(request.headers.get('x-forwarded-for')!.split(',')[0].trim()).digest('hex').slice(0, 16)
        : null,
    },
  });

  return token;
}

/**
 * Validate an admin session token and return the user
 */
export async function validateSessionToken(token: string): Promise<AuthUser | null> {
  const session = await prisma.adminSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    // Expired - clean up
    await prisma.adminSession.delete({ where: { id: session.id } });
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

/**
 * Delete an admin session (logout)
 */
export async function deleteAdminSession(token: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { token } });
}

/**
 * Clean up expired sessions (can be called periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.adminSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

/**
 * Get authenticated user from request.
 * Checks both new session tokens and legacy ADMIN_SECRET.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthUser | null> {
  // Check for new session token in cookie
  const sessionToken = request.cookies.get('sciblind-admin-token')?.value;

  if (sessionToken) {
    // First, check if it's the legacy ADMIN_SECRET
    if (ADMIN_SECRET && sessionToken === ADMIN_SECRET) {
      // Legacy auth - return a synthetic super admin user
      return {
        id: 'legacy-admin',
        email: 'admin@sciblind.local',
        name: 'Legacy Admin',
        role: 'SUPER_ADMIN',
      };
    }

    // Check if it's a valid session token
    const user = await validateSessionToken(sessionToken);
    if (user) return user;
  }

  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');

    // Legacy ADMIN_SECRET via header
    if (ADMIN_SECRET && token === ADMIN_SECRET) {
      return {
        id: 'legacy-admin',
        email: 'admin@sciblind.local',
        name: 'Legacy Admin',
        role: 'SUPER_ADMIN',
      };
    }

    // New session token via header
    const user = await validateSessionToken(token);
    if (user) return user;
  }

  return null;
}

/**
 * Require admin authentication.
 * Returns NextResponse error if not authenticated, or null if OK.
 */
export async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized. Authentication required.', errorKey: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Require super admin role.
 * Returns NextResponse error if not super admin, or null if OK.
 */
export async function requireSuperAdmin(request: NextRequest): Promise<NextResponse | null> {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized. Authentication required.', errorKey: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Forbidden. Super admin access required.', errorKey: 'SUPER_ADMIN_REQUIRED' },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Check if user has access to a study.
 * Super admins can access any study.
 * Regular users can only access studies they own.
 */
export async function canAccessStudy(user: AuthUser, studyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;

  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: { ownerId: true, isLegacy: true },
  });

  if (!study) return false;

  // Legacy studies are only visible to superadmins and their designated owner
  if (study.isLegacy && study.ownerId !== user.id) {
    return false;
  }

  return study.ownerId === user.id;
}

/**
 * Authenticate user with email and password.
 * Returns user if successful, null if invalid credentials.
 */
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (!user || !user.isActive) return null;

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) return null;

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return user;
}

/**
 * Create a new user account.
 */
export async function createUser(
  email: string,
  password: string,
  name?: string,
  role: UserRole = 'USER'
): Promise<User> {
  const passwordHash = await hashPassword(password);

  return prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
      role,
    },
  });
}

/**
 * Generate password reset token for a user.
 * Returns the token (to be sent via email).
 */
export async function generatePasswordReset(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return null;

  const resetToken = generateResetToken();
  const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry },
  });

  return resetToken;
}

/**
 * Reset password using reset token.
 */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { resetToken: token } });

  if (!user) return false;
  if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) return false;

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  // Invalidate all existing sessions
  await prisma.adminSession.deleteMany({ where: { userId: user.id } });

  return true;
}
