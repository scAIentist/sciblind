/**
 * Hashing utilities for SciBLIND
 *
 * Used for access code hashing and IP fingerprinting
 */

import crypto from 'crypto';

/**
 * Hash an access code using SHA256
 *
 * @param code - Plain text access code
 * @returns SHA256 hash of the code
 */
export function hashAccessCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Hash an IP address with salt for privacy
 *
 * @param ip - IP address to hash
 * @param salt - Salt from environment (IP_SALT)
 * @returns Salted SHA256 hash
 */
export function hashIP(ip: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

/**
 * Generate a secure random token for session
 *
 * @param length - Length in bytes (default 32, produces 64 hex chars)
 * @returns Random hex string
 */
export function generateSessionToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a random numeric code
 *
 * @param digits - Number of digits (default 5)
 * @returns Random numeric string
 */
export function generateNumericCode(digits: number = 5): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

/**
 * Verify an access code against its hash
 *
 * @param code - Plain text code to verify
 * @param hash - Stored hash to compare against
 * @returns True if code matches hash
 */
export function verifyAccessCode(code: string, hash: string): boolean {
  const codeHash = hashAccessCode(code);
  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(hash));
}
