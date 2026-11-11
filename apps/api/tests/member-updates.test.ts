import { afterEach, describe, expect, expectTypeOf, it, mock, spyOn } from "bun:test";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { hc } from "hono/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import {
  memberSchema,
  SELF_EDITABLE_MEMBER_FIELDS,
  updateMemberProfileRequestSchema,
  updateMemberRequestSchema,
} from "@internal-tool/shared";
import type { ErrorResponse, Member, UpdateMemberRequest } from "@internal-tool/shared";
import { app } from "../src/app";
import type { AppType } from "../src/app";
import type { api as webApi } from "../../web/src/lib/api";
import type { db } from "../src/db";
import { members, user } from "../src/db/schema";
import * as service from "../src/services/members";

const client = hc<AppType>("http://localhost", { fetch: app.request.bind(app) });
const fakeId = "00000000-0000-4000-8000-000000000001";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function patch(id: string, body: unknown) {
  return app.request(`/api/v1/members/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function withUpdates(
  run: (tx: Transaction, original: Member, other: Member) => Promise<void>
) {
  const { db: database } = await import("../src/db");
  const updateMember = service.updateMember;
  try {
    await database.transaction(async (tx) => {
      const marker = crypto.randomUUID().replaceAll("-", "");
      const authId = crypto.randomUUID();
      await tx
        .insert(user)
        .values({ id: authId, name: "Fake User", email: `${marker}@example.com` });
      const rows = await tx
        .insert(members)
        .values([
          {
            firstName: "Fake",
            lastName: "Member",
            email: `${marker}@example.com`,
            displayName: "Example",
            otherEmails: ["alternate@example.com"],
            pronouns: "they/them",
            gradYear: 2030,
            majors: ["Computer Science"],
            minors: ["Math"],
            githubUsername: `a-${marker}`,
            linkedinUrl: "https://www.linkedin.com/in/example",
            portfolioUrl: "https://example.com",
            userId: authId,
            isSuperuser: true,
            invitedAt: new Date("2020-01-01T12:00:00Z"),
            activatedAt: new Date("2020-01-02T12:00:00Z"),
            createdAt: new Date("2020-01-01T12:00:00Z"),
            updatedAt: new Date("2020-01-02T12:00:00Z"),
          },
          {
            firstName: "Other",
            lastName: "Example",
            email: `other-${marker}@example.com`,
            githubUsername: `b-${marker}`,
            status: "alumni",
          },
        ])
        .returning({ id: members.id });
      const original = await service.getMember(rows[0]!.id, tx);
      const other = await service.getMember(rows[1]!.id, tx);
      // Savepoints recover from expected constraint errors; the outer transaction rolls back all fixtures.
      spyOn(service, "updateMember").mockImplementation((id, request) =>
        tx.transaction((savepoint) => updateMember(id, request, savepoint))
      );
      await run(tx, original, other);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

describe("PATCH /api/v1/members/:id validation", () => {
  afterEach(() => mock.restore());

  const invalidBodies: Record<string, unknown>[] = [
    {},
    { status: "alumni" },
    { isSuperuser: false },
    { userId: "private" },
    { user_id: "private" },
    { unknown: "extra" },
    { id: fakeId },
    { createdAt: "2026-11-11T12:00:00Z" },
    { updatedAt: "2026-11-11T12:00:00Z" },
    { invitedAt: null },
    { activatedAt: null },
    { is_superuser: true },
    { firstName: "Changed", status: "alumni" },
    { firstName: null },
    { email: null },
    { email: "bad" },
    { firstName: " " },
    { githubUsername: "bad--name" },
    { gradYear: "2030" },
    { gradYear: 2101 },
    { portfolioUrl: "javascript:alert(1)" },
    { majors: null },
  ];
  it.each(invalidBodies)("rejects invalid, empty, or protected updates: %j", async (body) => {
    const update = spyOn(service, "updateMember");
    const response = await patch(fakeId, body);
    expect(response.status).toBe(400);
    const error = (await response.json()) as ErrorResponse;
    expect(error.error.code).toBe("VALIDATION");
    expect(Object.keys(error.error.fields ?? {}).length).toBeGreaterThan(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid UUID without querying", async () => {
    const update = spyOn(service, "updateMember");
    const response = await patch("not-a-uuid", { displayName: "Changed" });
    expect(response.status).toBe(400);
    const error = (await response.json()) as ErrorResponse;
    expect(error.error.code).toBe("VALIDATION");
    expect(error.error.fields).toHaveProperty("id");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without querying", async () => {
    const update = spyOn(service, "updateMember");
    const response = await app.request(`/api/v1/members/${fakeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorResponse).error.code).toBe("VALIDATION");
    expect(update).not.toHaveBeenCalled();
  });

  it("distinguishes exec-editable fields from the exact self-service profile allowlist", () => {
    expect(Object.keys(SELF_EDITABLE_MEMBER_FIELDS).sort()).toEqual([
      "displayName",
      "githubUsername",
      "gradYear",
      "linkedinUrl",
      "portfolioUrl",
      "pronouns",
    ]);
    const execOnly = {
      firstName: "Updated",
      lastName: "Member",
      email: "new@example.com",
      otherEmails: [],
      majors: [],
      minors: [],
    };
    for (const [key, value] of Object.entries(execOnly)) {
      expect(updateMemberRequestSchema.safeParse({ [key]: value }).success).toBe(true);
      expect(updateMemberProfileRequestSchema.safeParse({ [key]: value }).success).toBe(false);
    }
    for (const field of Object.keys(SELF_EDITABLE_MEMBER_FIELDS)) {
      expect(updateMemberRequestSchema.safeParse({ [field]: null }).success).toBe(true);
      expect(updateMemberProfileRequestSchema.safeParse({ [field]: null }).success).toBe(true);
    }
  });

  it("preserves typed PATCH bodies and safe frontend response types", () => {
    expectTypeOf<
      InferRequestType<(typeof client.api.v1.members)[":id"]["$patch"]>["json"]
    >().toEqualTypeOf<UpdateMemberRequest>();
    expectTypeOf<
      InferResponseType<(typeof webApi.api.v1.members)[":id"]["$patch"], 200>
    >().toEqualTypeOf<Member>();
    expectTypeOf<
      InferResponseType<(typeof webApi.api.v1.members)[":id"]["$patch"], 409>
    >().toEqualTypeOf<ErrorResponse>();
  });
});

describe("member updates against PostgreSQL", () => {
  afterEach(() => mock.restore());

  it("updates one field through the typed client and preserves all omitted data", async () => {
    await withUpdates(async (tx, original, other) => {
      const response = await client.api.v1.members[":id"].$patch({
        param: { id: original.id },
        json: { displayName: " Changed " },
      });
      expect(response.status).toBe(200);
      const updated = memberSchema.parse(await response.json());
      expect(updated).toEqual({
        ...original,
        displayName: "Changed",
        updatedAt: updated.updatedAt,
      });
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(original.updatedAt).getTime()
      );
      expect(await service.getMember(original.id, tx)).toEqual(updated);
      expect(await service.getMember(other.id, tx)).toEqual(other);
    });
  });

  it("updates multiple exec-editable fields with normalization", async () => {
    await withUpdates(async (tx, original) => {
      const fields = {
        firstName: "Updated",
        lastName: "Example",
        email: `new-${original.email}`,
        otherEmails: ["new-alternate@example.com"],
        majors: ["Physics"],
        minors: [],
        gradYear: 2031,
        pronouns: "she/her",
        linkedinUrl: "https://www.linkedin.com/in/updated",
        portfolioUrl: "https://example.com/updated",
        githubUsername: null,
      };
      const response = await patch(original.id, {
        ...fields,
        firstName: " Updated ",
        email: fields.email.toUpperCase(),
        otherEmails: [" NEW-ALTERNATE@EXAMPLE.COM "],
      });
      expect(response.status).toBe(200);
      const updated = memberSchema.parse(await response.json());
      expect(updated).toMatchObject(fields);
      expect(updated.displayName).toBe(original.displayName);
      expect(await service.getMember(original.id, tx)).toEqual(updated);
    });
  });

  it("clears every nullable profile field with null and permits empty arrays", async () => {
    await withUpdates(async (tx, original) => {
      const cleared = Object.fromEntries(
        Object.keys(SELF_EDITABLE_MEMBER_FIELDS).map((key) => [key, null])
      );
      const response = await patch(original.id, {
        ...cleared,
        otherEmails: [],
        majors: [],
        minors: [],
      });
      expect(response.status).toBe(200);
      const updated = memberSchema.parse(await response.json());
      expect(updated).toMatchObject({ ...cleared, otherEmails: [], majors: [], minors: [] });
      expect(updated.email).toBe(original.email);
      expect(await service.getMember(original.id, tx)).toEqual(updated);
    });
  });

  it("does not apply the valid part of a request containing protected fields", async () => {
    await withUpdates(async (tx, original) => {
      const response = await patch(original.id, { displayName: "Changed", isSuperuser: false });
      expect(response.status).toBe(400);
      expect(await service.getMember(original.id, tx)).toEqual(original);
    });
  });

  it("returns NOT_FOUND for an unknown UUID", async () => {
    await withUpdates(async () => {
      const response = await patch(crypto.randomUUID(), { displayName: "Changed" });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "NOT_FOUND", message: "Member not found." },
      });
    });
  });

  it.each(["email", "githubUsername"] as const)(
    "returns a case-insensitive %s conflict without partially updating",
    async (field) => {
      await withUpdates(async (tx, original, other) => {
        if (field === "email") {
          // Bypass request normalization to verify that the database constraint itself folds case.
          await tx
            .update(members)
            .set({ email: other.email.toUpperCase() })
            .where(eq(members.id, other.id));
        }
        const value = field === "email" ? other.email : other.githubUsername!.toUpperCase();
        const response = await patch(original.id, {
          firstName: "Should not persist",
          [field]: value,
        });
        expect(response.status).toBe(409);
        const error = (await response.json()) as ErrorResponse;
        expect(error.error.code).toBe("CONFLICT");
        expect(error.error.fields).toEqual({ [field]: "Already in use." });
        expect(await service.getMember(original.id, tx)).toEqual(original);
      });
    }
  );

  it("allows keeping the member's own email and GitHub username, including case changes", async () => {
    await withUpdates(async (tx, original) => {
      const response = await patch(original.id, {
        email: original.email.toUpperCase(),
        githubUsername: original.githubUsername!.toUpperCase(),
      });
      expect(response.status).toBe(200);
      const updated = memberSchema.parse(await response.json());
      expect(updated.email).toBe(original.email);
      expect(updated.githubUsername).toBe(original.githubUsername!.toUpperCase());
      expect(await service.getMember(original.id, tx)).toEqual(updated);
    });
  });

  it("excludes auth identifiers from the raw response and preserves auth and protected state", async () => {
    await withUpdates(async (tx, original) => {
      const [before] = await tx.select().from(members).where(eq(members.id, original.id));
      const response = await patch(original.id, { pronouns: "he/him" });
      expect(response.status).toBe(200);
      const raw = await response.json();
      expect(raw).toEqual(memberSchema.parse(raw));
      expect(raw).not.toHaveProperty("userId");
      expect(raw).not.toHaveProperty("user_id");
      expect(JSON.stringify(raw)).not.toContain(before!.userId!);
      const [after] = await tx.select().from(members).where(eq(members.id, original.id));
      expect(after?.userId).toBe(before?.userId);
      expect(after?.status).toBe(before?.status);
      expect(after?.isSuperuser).toBe(before?.isSuperuser);
      expect(after?.createdAt).toEqual(before?.createdAt);
      expect(after?.invitedAt).toEqual(before?.invitedAt);
      expect(after?.activatedAt).toEqual(before?.activatedAt);
      expect(await tx.select().from(user).where(eq(user.id, before!.userId!))).toHaveLength(1);
    });
  });
});
