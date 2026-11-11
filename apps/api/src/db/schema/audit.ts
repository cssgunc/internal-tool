import type { AuditChanges } from "@internal-tool/shared";
import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Append-only record of sensitive actions (TDD 2.5, TDD 3.1 Audit). Rows are written
// with recordAudit in src/services/audit.ts and never updated or deleted by the app.
// At deploy, the app's database role gets INSERT and SELECT only on this table, and
// the retention job gets a separate role that may scrub `changes`.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // NULL = the system did it. No foreign key on purpose: entries must outlive the
    // member, and actor_label keeps their name.
    actorMemberId: uuid("actor_member_id"),
    actorLabel: text("actor_label").notNull(), // name snapshot, survives member deletion
    action: text("action").notNull(), // e.g. 'position.assign', 'submission.edit', 'retention.wipe'
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    changes: jsonb("changes").$type<AuditChanges>(), // { field: { old, new } }
    scrubbedAt: timestamp("scrubbed_at", { withTimezone: true }), // set when retention removes the values in `changes`
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One index per audit-log filter; the list is always sorted newest first.
  (t) => [
    index("audit_log_created_at_idx").on(t.createdAt.desc(), t.id.desc()),
    index("audit_log_actor_idx").on(t.actorMemberId),
    index("audit_log_action_idx").on(t.action),
    index("audit_log_target_idx").on(t.targetType, t.targetId),
  ]
);
