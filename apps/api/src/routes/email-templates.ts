import { Hono } from "hono";

import {
  EMAIL_KINDS,
  findDisallowedPlaceholders,
  updateEmailTemplateSchema,
  type EmailKind,
} from "@internal-tool/shared";

import { db } from "../db";
import { emailTemplates } from "../db/schema";
import { validate } from "../lib/validation";
import { errorResponse } from "../lib/errors";

export const emailTemplateRoutes = new Hono()
  // TODO(auth): Restrict to exec members.
  .get("/", async (c) => {
    const templates = await db.select().from(emailTemplates);

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

    const [updated] = await db
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

    return c.json(updated, 200);
  });
