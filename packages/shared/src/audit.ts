import { z } from "zod";
import { pageQuerySchema } from "./lists";

// Audit actions are named `<resource>.<verb>`, both snake_case, with the resource
// singular: `interest_meeting.create`, `position.assign`, `submission.edit`,
// `retention.wipe`. The log is filtered by exact action name, so reuse an existing
// name when one fits instead of inventing a synonym.
export const AUDIT_ACTION_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

// What changed, by field: { title: { old: "Kickoff", new: "Fall Kickoff" } }.
// Values are stored as JSON, so dates come back as ISO strings.
export const auditChangesSchema = z.record(
  z.string(),
  z.object({ old: z.unknown(), new: z.unknown() })
);

// GET /api/v1/audit-log filters (TDD 3.2 Superuser Admin). `actor` is a member id.
// `from` is inclusive and `to` exclusive, so from=Nov 1, to=Nov 2 is all of Nov 1.
export const auditLogQuerySchema = pageQuerySchema
  .extend({
    actor: z.uuid().optional(),
    action: z.string().trim().min(1).max(100).optional(),
    targetType: z.string().trim().min(1).max(100).optional(),
    targetId: z.string().trim().min(1).max(200).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((query) => !query.from || !query.to || Date.parse(query.from) < Date.parse(query.to), {
    path: ["to"],
    message: "Must be after from.",
  });

// One entry as the API returns it. A NULL actorMemberId means the system did it.
export const auditLogEntrySchema = z.object({
  id: z.number().int(),
  actorMemberId: z.uuid().nullable(),
  actorLabel: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  changes: auditChangesSchema.nullable(),
  scrubbedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

// Newest first (TDD 3.2 Lists). total counts every matching entry, not just this page.
export const auditLogListSchema = z.object({
  items: z.array(auditLogEntrySchema),
  total: z.number().int().nonnegative(),
});

export type AuditChanges = z.infer<typeof auditChangesSchema>;
export type AuditLogQuery = z.output<typeof auditLogQuerySchema>;
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
export type AuditLogList = z.infer<typeof auditLogListSchema>;
