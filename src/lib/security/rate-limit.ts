/**
 * In-memory rate limiting for API protection
 *
 * Uses a sliding window algorithm with automatic cleanup.
 * For production at scale, consider using Redis/Upstash.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (cleared on server restart)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

startCleanup();

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Prefix for the key (e.g., 'auth', 'vote') */
  prefix: string;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Check and update rate limit for a given identifier
 * @param identifier - Unique identifier (e.g., IP hash, session token)
 * @param config - Rate limit configuration
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const key = `${config.prefix}:${identifier}`;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  let entry = rateLimitStore.get(key);

  // Reset if window has passed
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  const remaining = Math.max(0, config.limit - entry.count);
  const success = entry.count <= config.limit;

  return {
    success,
    limit: config.limit,
    remaining,
    resetAt: entry.resetAt,
  };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  };
}

// Preset configurations for different endpoints
export const RATE_LIMITS = {
  // Auth: 5 attempts per minute (prevents brute force)
  auth: {
    limit: 5,
    windowSeconds: 60,
    prefix: 'auth',
  },
  // Voting: 60 votes per minute (normal pace is ~20-30)
  vote: {
    limit: 60,
    windowSeconds: 60,
    prefix: 'vote',
  },
  // Next pair: 120 requests per minute
  nextPair: {
    limit: 120,
    windowSeconds: 60,
    prefix: 'next-pair',
  },
  // General API: 100 requests per minute
  general: {
    limit: 100,
    windowSeconds: 60,
    prefix: 'general',
  },
} as const;
