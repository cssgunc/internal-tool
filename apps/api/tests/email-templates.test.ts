import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, desc, eq, gt } from "drizzle-orm";
import { EMAIL_KINDS } from "@internal-tool/shared";
import { z } from "zod";
import { app } from "../src/app";
import { env } from "../src/env";

const BASE = "/api/v1/email-templates";

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});

const templatesResponseSchema = z.object({
  items: z.array(
    z.object({
      kind: z.string(),
      subject: z.string(),
      body: z.string(),
    })
  ),
  total: z.number(),
});

describe("default email templates", () => {
  it("cover every kind and use only that kind's placeholders", async () => {
    const { findDisallowedPlaceholders } = await import("@internal-tool/shared");
    const { defaultTemplates } = await import("../src/db/seed-email-templates");

    expect(defaultTemplates.map((template) => template.kind).sort()).toEqual(
      [...EMAIL_KINDS].sort()
    );
    for (const template of defaultTemplates) {
      expect(findDisallowedPlaceholders(template.kind, template.subject, template.body)).toEqual(
        []
      );
    }
  });
});

// These return before touching the database, so they run without one.
describe("Email template endpoint validation", () => {
  it("PUT rejects an unknown email kind", async () => {
    const response = await app.request(`${BASE}/unknown-kind`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "Hello",
        body: "Welcome to CSSG!",
      }),
    });

    expect(response.status).toBe(400);

    const data = errorSchema.parse(await response.json());

    expect(data.error.code).toBe("VALIDATION");
    expect(data.error.fields?.kind).toBeDefined();
  });

  it("PUT rejects disallowed placeholders", async () => {
    const response = await app.request(`${BASE}/invite`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "Hello",
        body: "Welcome {{randomPlaceholder}}!",
      }),
    });

    expect(response.status).toBe(400);

    const data = errorSchema.parse(await response.json());

    expect(data.error.code).toBe("VALIDATION");
    expect(data.error.fields?.body).toContain("randomPlaceholder");
  });

  it("PUT rejects an invalid request body", async () => {
    const response = await app.request(`${BASE}/invite`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "",
        body: "",
      }),
    });

    expect(response.status).toBe(400);

    const data = errorSchema.parse(await response.json());

    expect(data.error.code).toBe("VALIDATION");
    expect(data.error.fields).toBeDefined();
  });

  it("PUT reports invalid subject placeholders under the subject field", async () => {
    const response = await app.request(`${BASE}/invite`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "Hello {{unknownName}}",
        body: "Welcome to CSSG!",
      }),
    });

    expect(response.status).toBe(400);

    const data = errorSchema.parse(await response.json());

    expect(data.error.code).toBe("VALIDATION");
    expect(data.error.fields?.subject).toContain("unknownName");
    expect(data.error.fields?.body).toBeUndefined();
  });

  it("PUT rejects invalid placeholders in both fields", async () => {
    const response = await app.request(`${BASE}/invite`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "Hello {{wrongSubject}}",
        body: "Welcome {{wrongBody}}!",
      }),
    });

    expect(response.status).toBe(400);

    const data = errorSchema.parse(await response.json());

    expect(data.error.code).toBe("VALIDATION");
    expect(data.error.fields?.subject).toContain("wrongSubject");
    expect(data.error.fields?.body).toContain("wrongBody");
  });
});

describe.skipIf(!env.DATABASE_URL)("Email template endpoints", () => {
  let original: { subject: string; body: string; updatedAt: Date } | undefined;
  let lastAuditIdBefore = 0;

  async function database() {
    const { db } = await import("../src/db");
    const { auditLog, emailTemplates } = await import("../src/db/schema");
    return { db, auditLog, emailTemplates };
  }

  function put(body: { subject: string; body: string }) {
    return app.request(`${BASE}/invite`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function newAuditEntries() {
    const { db, auditLog } = await database();
    return db
      .select({ action: auditLog.action, targetId: auditLog.targetId, changes: auditLog.changes })
      .from(auditLog)
      .where(and(gt(auditLog.id, lastAuditIdBefore), eq(auditLog.targetType, "email_template")))
      .orderBy(auditLog.id);
  }

  beforeAll(async () => {
    const { db, auditLog, emailTemplates } = await database();
    const { seedEmailTemplates } = await import("../src/db/seed-email-templates");
    await seedEmailTemplates(db);
    [original] = await db
      .select({
        subject: emailTemplates.subject,
        body: emailTemplates.body,
        updatedAt: emailTemplates.updatedAt,
      })
      .from(emailTemplates)
      .where(eq(emailTemplates.kind, "invite"));
    const [last] = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .orderBy(desc(auditLog.id))
      .limit(1);
    lastAuditIdBefore = last?.id ?? 0;
  });

  afterAll(async () => {
    const { db, auditLog, emailTemplates } = await database();
    if (original) {
      await db.update(emailTemplates).set(original).where(eq(emailTemplates.kind, "invite"));
    }
    await db
      .delete(auditLog)
      .where(and(gt(auditLog.id, lastAuditIdBefore), eq(auditLog.targetType, "email_template")));
  });

  it("GET returns a template for every kind", async () => {
    const response = await app.request(BASE);

    expect(response.status).toBe(200);

    const data = templatesResponseSchema.parse(await response.json());

    expect(data.total).toBe(data.items.length);
    expect(data.items.map((item) => item.kind).sort()).toEqual([...EMAIL_KINDS].sort());
  });

  it("PUT updates a valid template and records the edit in the audit log", async () => {
    const edit = {
      subject: "Your CSSG account is ready",
      body: "Hi {{firstName}}, set up your account: {{inviteUrl}}",
    };
    const response = await put(edit);

    expect(response.status).toBe(200);

    const data = z
      .object({
        kind: z.string(),
        subject: z.string(),
        body: z.string(),
      })
      .parse(await response.json());

    expect(data).toMatchObject({ kind: "invite", ...edit });
    expect(await newAuditEntries()).toEqual([
      {
        action: "email_template.update",
        targetId: "invite",
        changes: {
          subject: { old: original!.subject, new: edit.subject },
          body: { old: original!.body, new: edit.body },
        },
      },
    ]);
  });

  it("PUT with unchanged content records nothing new", async () => {
    const before = (await newAuditEntries()).length;
    const response = await put({
      subject: "Your CSSG account is ready",
      body: "Hi {{firstName}}, set up your account: {{inviteUrl}}",
    });

    expect(response.status).toBe(200);
    expect(await newAuditEntries()).toHaveLength(before);
  });

  it("rerunning the seed never overwrites an edited template", async () => {
    const { db, emailTemplates } = await database();
    const { seedEmailTemplates } = await import("../src/db/seed-email-templates");

    await seedEmailTemplates(db);

    const [invite] = await db
      .select({ subject: emailTemplates.subject })
      .from(emailTemplates)
      .where(eq(emailTemplates.kind, "invite"));
    expect(invite?.subject).toBe("Your CSSG account is ready");
  });
});
