import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { app } from "../src/app";

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

describe("Email template endpoints", () => {
  it("GET returns the email templates", async () => {
    const response = await app.request(BASE);

    expect(response.status).toBe(200);

    const data = templatesResponseSchema.parse(await response.json());

    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total).toBe(data.items.length);
    expect(data.items.length).toBeGreaterThan(0);
  });

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

  it("PUT successfully updates a valid email template", async () => {
    const response = await app.request(`${BASE}/invite`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "Welcome to CSSG!",
        body: "Hi {{firstName}}, visit {{siteUrl}} to get started.",
      }),
    });

    expect(response.status).toBe(200);

    const data = z
      .object({
        kind: z.string(),
        subject: z.string(),
        body: z.string(),
      })
      .parse(await response.json());

    expect(data.kind).toBe("invite");
    expect(data.subject).toBe("Welcome to CSSG!");
    expect(data.body).toContain("{{firstName}}");
  });
});
