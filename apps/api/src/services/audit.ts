import { isDeepStrictEqual } from "node:util";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { AUDIT_ACTION_PATTERN } from "@internal-tool/shared";
import type { AuditChanges, AuditLogList, AuditLogQuery } from "@internal-tool/shared";
import type { db } from "../db";
import { auditLog } from "../db/schema";

// The audit log (TDD 2.5) is append-only: this file only inserts and reads entries,
// and nothing in the API may update or delete them.
//
// Every write marked 📝 in TDD 3.2 calls recordAudit with the transaction that makes
// the change, so the entry is saved if and only if the change is. Action names follow
// `<resource>.<verb>` (see AUDIT_ACTION_PATTERN in packages/shared).

export const SYSTEM_ACTOR_LABEL = "System";

// Who did it. label is a snapshot of the member's name, so the entry still reads
// correctly after the member is deleted. Leave actor out for scheduled jobs.
export type AuditActor = { memberId: string; label: string };

export type AuditEntry = {
  actor?: AuditActor | null;
  action: string;
  targetType: string;
  targetId: string;
  changes?: AuditChanges | null;
};

// The shared connection or a transaction. Writers can only insert.
type AuditWriter = Pick<typeof db, "insert">;
type AuditReader = Pick<typeof db, "select">;

// Required rather than defaulting to the shared connection, so a caller can't forget
// to pass its transaction and log a change that later rolls back.
export async function recordAudit(
  { actor, action, targetType, targetId, changes }: AuditEntry,
  database: AuditWriter
): Promise<{ id: number }> {
  if (!AUDIT_ACTION_PATTERN.test(action)) {
    throw new Error(`Audit action "${action}" must be named <resource>.<verb>.`);
  }

  const [entry] = await database
    .insert(auditLog)
    .values({
      actorMemberId: actor?.memberId ?? null,
      actorLabel: actor?.label ?? SYSTEM_ACTOR_LABEL,
      action,
      targetType,
      targetId,
      changes: changes ?? null,
    })
    .returning({ id: auditLog.id });
  if (!entry) throw new Error("Audit insert returned no row.");
  return entry;
}

type Fields = Record<string, unknown>;

// The fields that differ between two versions of a record, as { field: { old, new } }.
// Pass null as `before` for a new record and as `after` for a deleted one. Values are
// compared as they'll be stored in JSON, so equal dates aren't a change and undefined
// counts as null. Returns {} when nothing changed. Leave secrets (tokens, passwords)
// out of both objects: the audit log is permanent.
export function diffChanges(before: Fields | null, after: Fields | null): AuditChanges {
  const oldFields = before ?? {};
  const newFields = after ?? {};
  const changes: AuditChanges = {};

  for (const field of new Set([...Object.keys(oldFields), ...Object.keys(newFields)])) {
    const oldValue = toJson(oldFields[field]);
    const newValue = toJson(newFields[field]);
    if (!isDeepStrictEqual(oldValue, newValue)) {
      changes[field] = { old: oldValue, new: newValue };
    }
  }
  return changes;
}

function toJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}

// One page of entries, newest first, matching every filter given (TDD 3.2 Superuser
// Admin). The id breaks ties: entries from one transaction share a created_at.
export async function listAuditLog(
  { page, pageSize, actor, action, targetType, targetId, from, to }: AuditLogQuery,
  database?: AuditReader
): Promise<AuditLogList> {
  // Loaded on first use: src/db throws on import when DATABASE_URL is missing.
  const conn = database ?? (await import("../db")).db;

  const where = and(
    actor ? eq(auditLog.actorMemberId, actor) : undefined,
    action ? eq(auditLog.action, action) : undefined,
    targetType ? eq(auditLog.targetType, targetType) : undefined,
    targetId ? eq(auditLog.targetId, targetId) : undefined,
    from ? gte(auditLog.createdAt, new Date(from)) : undefined,
    to ? lt(auditLog.createdAt, new Date(to)) : undefined
  );

  // Columns are listed so a column added later doesn't show up in the API unnoticed.
  const rows = await conn
    .select({
      id: auditLog.id,
      actorMemberId: auditLog.actorMemberId,
      actorLabel: auditLog.actorLabel,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      changes: auditLog.changes,
      scrubbedAt: auditLog.scrubbedAt,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totals] = await conn.select({ total: count() }).from(auditLog).where(where);

  return {
    items: rows.map((row) => ({
      ...row,
      scrubbedAt: row.scrubbedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total: totals?.total ?? 0,
  };
}
