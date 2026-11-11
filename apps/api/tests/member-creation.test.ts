import { afterEach, describe, expect, expectTypeOf, it, mock, spyOn } from "bun:test";
import { count, eq, inArray, TransactionRollbackError } from "drizzle-orm";
import { hc } from "hono/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import { memberSchema } from "@internal-tool/shared";
import type { CreateMemberRequest, ErrorResponse, Member } from "@internal-tool/shared";
import { app } from "../src/app";
import type { AppType } from "../src/app";
import type { api as webApi } from "../../web/src/lib/api";
import type { db } from "../src/db";
import { members, user } from "../src/db/schema";
import * as service from "../src/services/members";

const client = hc<AppType>("http://localhost", { fetch: app.request.bind(app) });
const minimal = { firstName: "Fake", lastName: "Member", email: "fake@example.com" };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function withCreation(run: (tx: Transaction, email: string) => Promise<void>) {
  const { db: database } = await import("../src/db");
  const createMember = service.createMember;
  try {
    await database.transaction(async (tx) => {
      // Each request uses a savepoint so a uniqueness error does not abort the fixture transaction.
      spyOn(service, "createMember").mockImplementation((request) =>
        tx.transaction((savepoint) => createMember(request, savepoint))
      );
      await run(tx, `${crypto.randomUUID()}@example.com`);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

describe("POST /api/v1/members validation", () => {
  afterEach(() => mock.restore());

  const invalidInputs: Record<string, unknown>[] = [
    {},
    { lastName: "Member", email: minimal.email },
    { firstName: "Fake", email: minimal.email },
    { firstName: "Fake", lastName: "Member" },
    { ...minimal, email: "invalid" },
    { ...minimal, firstName: " " },
    { ...minimal, githubUsername: "bad--name" },
    { ...minimal, gradYear: "2030" },
    { ...minimal, portfolioUrl: "javascript:alert(1)" },
    { ...minimal, status: "alumni" },
    { ...minimal, isSuperuser: true },
    { ...minimal, userId: "private" },
    { ...minimal, user_id: "private" },
    { ...minimal, unknown: "extra" },
  ];
  it.each(invalidInputs)(
    "rejects invalid or protected input without inserting: %j",
    async (input) => {
      const create = spyOn(service, "createMember");
      const response = await app.request("/api/v1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION");
      expect(Object.keys(body.error.fields ?? {}).length).toBeGreaterThan(0);
      expect(create).not.toHaveBeenCalled();
    }
  );

  it("rejects malformed JSON before inserting", async () => {
    const create = spyOn(service, "createMember");
    const response = await app.request("/api/v1/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorResponse).error.code).toBe("VALIDATION");
    expect(create).not.toHaveBeenCalled();
  });

  it("preserves typed POST requests, created responses, and conflicts", () => {
    expectTypeOf<
      InferRequestType<typeof client.api.v1.members.$post>["json"]
    >().toEqualTypeOf<CreateMemberRequest>();
    expectTypeOf<
      InferResponseType<typeof webApi.api.v1.members.$post, 201>
    >().toEqualTypeOf<Member>();
    expectTypeOf<
      InferResponseType<typeof webApi.api.v1.members.$post, 409>
    >().toEqualTypeOf<ErrorResponse>();
  });
});

describe("member creation against PostgreSQL", () => {
  afterEach(() => mock.restore());

  it("creates a safe member with database defaults and no auth user or invitation", async () => {
    await withCreation(async (tx, email) => {
      const response = await client.api.v1.members.$post({ json: { ...minimal, email } });
      expect(response.status).toBe(201);
      const raw = await response.json();
      const member = memberSchema.parse(raw);
      expect(raw).toEqual(member);
      expect(member).toMatchObject({
        ...minimal,
        email,
        status: "active",
        isSuperuser: false,
        otherEmails: [],
        majors: [],
        minors: [],
        displayName: null,
        pronouns: null,
        gradYear: null,
        githubUsername: null,
        linkedinUrl: null,
        portfolioUrl: null,
        invitedAt: null,
        activatedAt: null,
      });
      const [stored] = await tx.select().from(members).where(eq(members.id, member.id));
      expect(stored?.userId).toBeNull();
      expect(stored?.status).toBe("active");
      expect(stored?.createdAt).toBeInstanceOf(Date);
      expect(stored?.updatedAt).toBeInstanceOf(Date);
      expect(await tx.select().from(user).where(eq(user.email, email))).toHaveLength(0);
      expect(raw).not.toHaveProperty("userId");
      expect(raw).not.toHaveProperty("user_id");
    });
  });

  it("persists validated optional fields and normalized names/emails", async () => {
    await withCreation(async (tx, email) => {
      const profile = {
        displayName: "Example",
        pronouns: "they/them",
        gradYear: 2030,
        githubUsername: `test-${crypto.randomUUID().replaceAll("-", "")}`,
        linkedinUrl: "https://www.linkedin.com/in/fake-member",
        portfolioUrl: "https://example.com/portfolio",
        otherEmails: ["other@example.com"],
        majors: ["Computer Science"],
        minors: ["Math"],
      };
      const response = await client.api.v1.members.$post({
        json: {
          ...minimal,
          ...profile,
          email: ` ${email.toUpperCase()} `,
          firstName: " Fake ",
          lastName: " Member ",
          otherEmails: [" OTHER@EXAMPLE.COM "],
        },
      });
      expect(response.status).toBe(201);
      const member = memberSchema.parse(await response.json());
      expect(member).toMatchObject({ ...minimal, ...profile, email });
      expect(await service.getMember(member.id, tx)).toEqual(member);
    });
  });

  it("accepts explicit null profile fields and multiple absent GitHub usernames", async () => {
    await withCreation(async (tx, email) => {
      for (const value of [email, `second-${email}`]) {
        const response = await client.api.v1.members.$post({
          json: {
            ...minimal,
            email: value,
            displayName: null,
            pronouns: null,
            gradYear: null,
            githubUsername: null,
            linkedinUrl: null,
            portfolioUrl: null,
          },
        });
        expect(response.status).toBe(201);
      }
      expect(
        await tx
          .select()
          .from(members)
          .where(inArray(members.email, [email, `second-${email}`]))
      ).toHaveLength(2);
    });
  });

  it.each([false, true])(
    "returns a field conflict for duplicate email (case variant: %s)",
    async (mixedCase) => {
      await withCreation(async (tx, email) => {
        await tx
          .insert(members)
          .values({ ...minimal, email: mixedCase ? email.toUpperCase() : email });
        const response = await client.api.v1.members.$post({
          json: {
            ...minimal,
            email: mixedCase ? email.toUpperCase() : email,
          },
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
          error: {
            code: "CONFLICT",
            message: "A member with this email already exists.",
            fields: { email: "Already in use." },
          },
        });
        expect(await tx.select().from(members).where(eq(members.email, email))).toHaveLength(1);
      });
    }
  );

  it.each([false, true])(
    "returns a field conflict for duplicate GitHub username (case variant: %s)",
    async (mixedCase) => {
      await withCreation(async (tx, email) => {
        const githubUsername = `test-${crypto.randomUUID().replaceAll("-", "")}`;
        await tx.insert(members).values({ ...minimal, email, githubUsername });
        const response = await client.api.v1.members.$post({
          json: {
            ...minimal,
            email: `other-${email}`,
            githubUsername: mixedCase ? githubUsername.toUpperCase() : githubUsername,
          },
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
          error: {
            code: "CONFLICT",
            message: "A member with this GitHub username already exists.",
            fields: { githubUsername: "Already in use." },
          },
        });
        expect(
          await tx.select().from(members).where(eq(members.githubUsername, githubUsername))
        ).toHaveLength(1);
        expect(
          await tx
            .select()
            .from(members)
            .where(eq(members.email, `other-${email}`))
        ).toHaveLength(0);
      });
    }
  );

  it.each(["email", "githubUsername"] as const)(
    "arbitrates concurrent %s duplicates through the database",
    async (field) => {
      const { db: database } = await import("../src/db");
      const marker = crypto.randomUUID().replaceAll("-", "");
      const emails = [`${marker}@example.com`, `other-${marker}@example.com`];
      const first = {
        ...minimal,
        email: emails[0]!,
        ...(field === "githubUsername" ? { githubUsername: `test-${marker}` } : {}),
      };
      const second =
        field === "email"
          ? { ...first, email: first.email.toUpperCase() }
          : { ...first, email: emails[1]!, githubUsername: `TEST-${marker.toUpperCase()}` };
      try {
        // Separate HTTP requests use the normal pool, so these are real competing inserts.
        const responses = await Promise.all([
          client.api.v1.members.$post({ json: first }),
          client.api.v1.members.$post({ json: second }),
        ]);
        expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
        const conflict = responses.find((response) => response.status === 409)!;
        expect(await conflict.json()).toMatchObject({
          error: { code: "CONFLICT", fields: { [field]: "Already in use." } },
        });
        const [stored] = await database
          .select({ total: count() })
          .from(members)
          .where(inArray(members.email, emails));
        expect(stored?.total).toBe(1);
      } finally {
        // Only these uniquely named fake records commit; remove them even if an assertion fails.
        await database.delete(members).where(inArray(members.email, emails));
      }
    }
  );
});
