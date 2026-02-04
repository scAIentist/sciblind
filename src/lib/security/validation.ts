/**
 * Input validation utilities for API security
 *
 * Validates and sanitizes input data to prevent injection attacks
 * and ensure data integrity.
 */

// CUID pattern (Prisma's default ID format)
const CUID_PATTERN = /^c[a-z0-9]{24}$/;

// Session token pattern (32 hex chars)
const SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

// Access code pattern (alphanumeric with hyphens, max 50 chars)
const ACCESS_CODE_PATTERN = /^[a-zA-Z0-9\-]{1,50}$/;

/**
 * Validate a CUID (used for IDs)
 */
export function isValidCuid(value: unknown): value is string {
  return typeof value === 'string' && CUID_PATTERN.test(value);
}

/**
 * Validate a session token
 */
export function isValidSessionToken(value: unknown): value is string {
  return typeof value === 'string' && SESSION_TOKEN_PATTERN.test(value);
}

/**
 * Validate an access code format
 */
export function isValidAccessCode(value: unknown): value is string {
  return typeof value === 'string' && ACCESS_CODE_PATTERN.test(value);
}

/**
 * Validate response time (must be positive number, max 10 minutes)
 */
export function isValidResponseTime(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 600000 // 10 minutes max
  );
}

/**
 * Sanitize string input (remove control characters, trim)
 */
export function sanitizeString(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== 'string') return null;

  // Remove control characters except newlines and tabs
  const sanitized = value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);

  return sanitized || null;
}

/**
 * Validate vote request body
 */
export interface VoteRequestBody {
  sessionToken: string;
  itemAId: string;
  itemBId: string;
  winnerId: string;
  leftItemId: string;
  rightItemId: string;
  categoryId?: string;
  responseTimeMs?: number;
}

export function validateVoteRequest(body: unknown): {
  valid: boolean;
  data?: VoteRequestBody;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const b = body as Record<string, unknown>;

  // Validate session token
  if (!isValidSessionToken(b.sessionToken)) {
    return { valid: false, error: 'Invalid session token format' };
  }

  // Validate item IDs
  if (!isValidCuid(b.itemAId)) {
    return { valid: false, error: 'Invalid itemAId format' };
  }
  if (!isValidCuid(b.itemBId)) {
    return { valid: false, error: 'Invalid itemBId format' };
  }
  if (!isValidCuid(b.winnerId)) {
    return { valid: false, error: 'Invalid winnerId format' };
  }
  if (!isValidCuid(b.leftItemId)) {
    return { valid: false, error: 'Invalid leftItemId format' };
  }
  if (!isValidCuid(b.rightItemId)) {
    return { valid: false, error: 'Invalid rightItemId format' };
  }

  // Validate categoryId if provided
  if (b.categoryId !== undefined && b.categoryId !== null && !isValidCuid(b.categoryId)) {
    return { valid: false, error: 'Invalid categoryId format' };
  }

  // Validate response time if provided
  if (b.responseTimeMs !== undefined && !isValidResponseTime(b.responseTimeMs)) {
    return { valid: false, error: 'Invalid responseTimeMs' };
  }

  // Validate winner is one of the items
  if (b.winnerId !== b.itemAId && b.winnerId !== b.itemBId) {
    return { valid: false, error: 'Winner must be one of the compared items' };
  }

  // Validate left/right are the items
  const itemIds = new Set([b.itemAId, b.itemBId]);
  if (!itemIds.has(b.leftItemId as string) || !itemIds.has(b.rightItemId as string)) {
    return { valid: false, error: 'Left/right must match itemA/itemB' };
  }

  return {
    valid: true,
    data: {
      sessionToken: b.sessionToken as string,
      itemAId: b.itemAId as string,
      itemBId: b.itemBId as string,
      winnerId: b.winnerId as string,
      leftItemId: b.leftItemId as string,
      rightItemId: b.rightItemId as string,
      categoryId: b.categoryId as string | undefined,
      responseTimeMs: b.responseTimeMs as number | undefined,
    },
  };
}

/**
 * Validate auth request body
 */
export function validateAuthRequest(body: unknown): {
  valid: boolean;
  code?: string;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const b = body as Record<string, unknown>;

  // Sanitize and validate code
  const code = sanitizeString(b.code, 50);
  if (!code) {
    return { valid: false, error: 'Access code is required' };
  }

  if (!isValidAccessCode(code)) {
    return { valid: false, error: 'Invalid access code format' };
  }

  return { valid: true, code };
}

/**
 * Extract client IP from request headers
 */
export function getClientIP(headers: Headers): string {
  // Check common proxy headers
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take first IP in chain (client IP)
    const ips = forwardedFor.split(',').map((ip) => ip.trim());
    if (ips[0] && ips[0].length < 50) {
      return ips[0];
    }
  }

  const realIP = headers.get('x-real-ip');
  if (realIP && realIP.length < 50) {
    return realIP;
  }

  // Vercel-specific header
  const vercelIP = headers.get('x-vercel-forwarded-for');
  if (vercelIP && vercelIP.length < 50) {
    return vercelIP.split(',')[0].trim();
  }

  return 'unknown';
}
