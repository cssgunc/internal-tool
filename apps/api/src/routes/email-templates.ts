import { eq } from "drizzle-orm";
import { Hono } from "hono";

import {
  EMAIL_KINDS,
  findDisallowedPlaceholders,
  updateEmailTemplateSchema,
  type EmailKind,
} from "@internal-tool/shared";

import { emailTemplates } from "../db/schema";
import { validate } from "../lib/validation";
import { errorResponse } from "../lib/errors";
import { diffChanges, recordAudit } from "../services/audit";

// Loaded on first use: src/db throws on import when DATABASE_URL is missing, and the
// app must start (and its other tests run) without one.
async function getDatabase() {
  return (await import("../db")).db;
}

export const emailTemplateRoutes = new Hono()
  // TODO(auth): Restrict to exec members.
  .get("/", async (c) => {
    const db = await getDatabase();
    const templates = await db.select().from(emailTemplates).orderBy(emailTemplates.kind);

    return c.json(
      {
        items: templates,
        total: templates.length,
      },
      200
    );
  })

  // TODO(auth): Restrict to exec members.
  .put("/:kind", validate("json", updateEmailTemplateSchema), async (c) => {
    const kind = c.req.param("kind");

    if (!EMAIL_KINDS.some((emailKind) => emailKind === kind)) {
      return c.json(
        errorResponse("VALIDATION", "Invalid email template kind.", {
          kind: "Unknown email kind.",
        }),
        400
      );
    }

    const validKind = kind as EmailKind;
    const { subject, body } = c.req.valid("json");

    const subjectErrors = findDisallowedPlaceholders(validKind, subject, "");

    const bodyErrors = findDisallowedPlaceholders(validKind, "", body);

    if (subjectErrors.length > 0 || bodyErrors.length > 0) {
      const fields: Record<string, string> = {};

      if (subjectErrors.length > 0) {
        fields.subject = `Disallowed placeholders: ${subjectErrors
          .map((placeholder) => `{{${placeholder}}}`)
          .join(", ")}`;
      }

      if (bodyErrors.length > 0) {
        fields.body = `Disallowed placeholders: ${bodyErrors
          .map((placeholder) => `{{${placeholder}}}`)
          .join(", ")}`;
      }

      return c.json(errorResponse("VALIDATION", "Invalid placeholders.", fields), 400);
    }

    const db = await getDatabase();
    // The edit and its audit entry (TDD 2.5) are saved together or not at all.
    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ subject: emailTemplates.subject, body: emailTemplates.body })
        .from(emailTemplates)
        .where(eq(emailTemplates.kind, validKind))
        .for("update");

      const [row] = await tx
        .insert(emailTemplates)
        .values({
          kind: validKind,
          subject,
          body,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: emailTemplates.kind,
          set: {
            subject,
            body,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!row) throw new Error("Email template upsert returned no row.");

      const changes = diffChanges(before ?? null, { subject, body });
      if (Object.keys(changes).length > 0) {
        // TODO(auth): pass the signed-in member as the audit actor; until then it's System.
        await recordAudit(
          {
            action: "email_template.update",
            targetType: "email_template",
            targetId: validKind,
            changes,
          },
          tx
        );
      }
      return row;
    });

    return c.json(updated, 200);
  });
