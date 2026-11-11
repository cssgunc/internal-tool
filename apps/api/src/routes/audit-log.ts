import { Hono } from "hono";
import { auditLogQuerySchema } from "@internal-tool/shared";
import { validate } from "../lib/validation";
import { listAuditLog } from "../services/audit";

// Read-only on purpose: the audit log has no routes that edit or delete entries.
export const auditLogRoutes = new Hono().get(
  "/",
  validate("query", auditLogQuerySchema),
  async (c) => {
    // TODO(auth): minimum access is `superuser` (TDD 3.2); check it here once sessions
    // are linked to members.
    return c.json(await listAuditLog(c.req.valid("query")), 200);
  }
);
