import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export interface AuditEntry {
  restaurantId: string;
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Writes an audit row. Takes an optional transaction client so the audit entry
 * commits or rolls back together with the change it describes — an audit log
 * that records changes which never happened is worse than none.
 */
export async function writeAudit(
  client: Prisma.TransactionClient | null,
  entry: AuditEntry,
): Promise<void> {
  const db = client ?? prisma;
  await db.auditLog.create({
    data: {
      restaurantId: entry.restaurantId,
      userId: entry.userId ?? undefined,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    },
  });
}

/** Field-level diff, so the audit view can show exactly what moved. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } | null {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};
  let changed = false;

  for (const key of Object.keys(after) as Array<keyof T>) {
    const oldValue = before[key];
    const newValue = after[key];
    if (String(oldValue) !== String(newValue)) {
      changedBefore[key] = oldValue;
      changedAfter[key] = newValue;
      changed = true;
    }
  }
  return changed ? { before: changedBefore, after: changedAfter } : null;
}
