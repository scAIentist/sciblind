/**
 * Activity Logging System
 *
 * Provides a simple, non-blocking way to log all portal activity.
 * Logs are stored in the ActivityLog table (immutable append-only).
 *
 * Usage:
 *   await logActivity('VOTE_CAST', { studyId, sessionId, metadata: { ... } });
 *
 * Logging failures are caught and printed to console — they never
 * interrupt the main request flow.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

type ActivityAction =
  | 'SESSION_CREATED'
  | 'SESSION_COMPLETED'
  | 'SESSION_RESUMED'
  | 'VOTE_CAST'
  | 'VOTE_FLAGGED'
  | 'CATEGORY_SELECTED'
  | 'CATEGORY_COMPLETED'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'AUTH_RATE_LIMITED'
  | 'STUDY_CREATED'
  | 'STUDY_UPDATED'
  | 'ITEMS_UPLOADED'
  | 'RANKINGS_VIEWED'
  | 'EXPORT_DOWNLOADED'
  | 'ELO_RESET'
  | 'SCHEMA_MIGRATED';

interface LogOptions {
  studyId?: string;
  sessionId?: string;
  userId?: string;
  ipHash?: string;
  userAgent?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an activity event. This is fire-and-forget — it won't throw
 * or block the calling function even if the DB write fails.
 */
export function logActivity(action: ActivityAction, options: LogOptions = {}): void {
  // Fire and forget — don't await, don't block
  prisma.activityLog.create({
    data: {
      action,
      detail: options.detail,
      studyId: options.studyId,
      sessionId: options.sessionId,
      userId: options.userId,
      ipHash: options.ipHash,
      userAgent: options.userAgent,
      metadata: (options.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  }).catch((err) => {
    console.error('[ActivityLog] Failed to write log:', action, err.message);
  });
}

/**
 * Log an activity event and wait for it to complete.
 * Use this when you need to ensure the log was written (e.g., for audit-critical events).
 */
export async function logActivitySync(action: ActivityAction, options: LogOptions = {}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action,
        detail: options.detail,
        studyId: options.studyId,
        sessionId: options.sessionId,
        userId: options.userId,
        ipHash: options.ipHash,
        userAgent: options.userAgent,
        metadata: (options.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err: any) {
    console.error('[ActivityLog] Failed to write log:', action, err.message);
  }
}
