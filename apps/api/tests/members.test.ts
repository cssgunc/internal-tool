import { afterEach, describe, expect, expectTypeOf, it, mock, spyOn } from "bun:test";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { hc } from "hono/client";
import type { InferResponseType } from "hono/client";
import { memberListSchema, memberSchema } from "@internal-tool/shared";
import type { ErrorResponse, Member, MemberList } from "@internal-tool/shared";
import { app } from "../src/app";
import type { AppType } from "../src/app";
import type { api as webApi } from "../../web/src/lib/api";
import type { db } from "../src/db";
import { members, user } from "../src/db/schema";
import * as service from "../src/services/members";

const client = hc<AppType>("http://localhost", { fetch: app.request.bind(app) });

const member: Member = {
  id: "00000000-0000-4000-8000-000000000001",
  firstName: "Fake",
  lastName: "Member",
  email: "fake@example.com",
  displayName: null,
  otherEmails: [],
  pronouns: null,
  gradYear: null,
  majors: [],
  minors: [],
  githubUsername: null,
  linkedinUrl: null,
  portfolioUrl: null,
  isSuperuser: false,
  status: "active",
  invitedAt: null,
  activatedAt: null,
  createdAt: "2026-11-11T12:00:00.000Z",
  updatedAt: "2026-11-11T12:00:00.000Z",
};

describe("members GET routes", () => {
  afterEach(() => mock.restore());

  it("uses default pagination and the safe list response", async () => {
    const list = spyOn(service, "listMembers").mockResolvedValue({ items: [member], total: 1 });
    const response = await client.api.v1.members.$get({ query: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [member], total: 1 });
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
  });

  it("passes parsed pagination, trimmed search, and each status to the service", async () => {
    const list = spyOn(service, "listMembers").mockResolvedValue({ items: [], total: 0 });
    for (const status of ["active", "alumni"]) {
      const response = await app.request(
        `/api/v1/members?page=2&pageSize=3&search=%20Fake%20&status=${status}`
      );
      expect(response.status).toBe(200);
      expect(list).toHaveBeenLastCalledWith({ page: 2, pageSize: 3, search: "Fake", status });
    }
  });

  it.each([
    ["page", "0"],
    ["page", "abc"],
    ["page", "1.5"],
    ["pageSize", "0"],
    ["pageSize", "201"],
    ["status", "inactive"],
    ["search", "x".repeat(255)],
  ])("rejects invalid %s before querying the database", async (field, value) => {
    const list = spyOn(service, "listMembers");
    const response = await app.request(`/api/v1/members?${field}=${value}`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fields).toHaveProperty(field);
    expect(list).not.toHaveBeenCalled();
  });

  it("rejects repeated scalar query parameters", async () => {
    const list = spyOn(service, "listMembers");
    const response = await app.request("/api/v1/members?status=active&status=alumni");
    expect(response.status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it("looks up a valid UUID and returns the member", async () => {
    const get = spyOn(service, "getMember").mockResolvedValue(member);
    const response = await app.request(`/api/v1/members/${member.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(member);
    expect(get).toHaveBeenCalledWith(member.id);
  });

  it("rejects an invalid UUID with a field error before querying", async () => {
    const get = spyOn(service, "getMember");
    const response = await app.request("/api/v1/members/not-a-uuid");
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fields).toHaveProperty("id");
    expect(get).not.toHaveBeenCalled();
  });

  it("preserves typed member responses in the actual frontend client", () => {
    expectTypeOf<
      InferResponseType<typeof client.api.v1.members.$get, 200>
    >().toEqualTypeOf<MemberList>();
    expectTypeOf<
      InferResponseType<(typeof client.api.v1.members)[":id"]["$get"], 200>
    >().toEqualTypeOf<Member>();
    expectTypeOf<
      InferResponseType<typeof webApi.api.v1.members.$get, 200>
    >().toEqualTypeOf<MemberList>();
    expectTypeOf<
      InferResponseType<(typeof webApi.api.v1.members)[":id"]["$get"], 404>
    >().toEqualTypeOf<ErrorResponse>();
  });
});

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Real PostgreSQL queries with unique fake records. Roll back every fixture, even on failure.
async function withMembers(run: (tx: Transaction, marker: string, ids: string[]) => Promise<void>) {
  const { db: database } = await import("../src/db");
  try {
    await database.transaction(async (tx) => {
      const marker = `Members${crypto.randomUUID().replaceAll("-", "")}`;
      const rows = await tx
        .insert(members)
        .values([
          { firstName: `Before${marker}After`, lastName: "A", email: `${marker}1@example.com` },
          {
            firstName: "Fake",
            lastName: `Before${marker}After`,
            email: `${marker}2@example.com`,
            status: "alumni",
          },
          { firstName: "Same", lastName: "Z", email: `before${marker}after@example.com` },
          { firstName: "Same", lastName: "Z", email: `${marker}4@example.com` },
        ])
        .returning({ id: members.id });
      await run(
        tx,
        marker,
        rows.map((row) => row.id)
      );
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

describe("members GET services against PostgreSQL", () => {
  afterEach(() => mock.restore());

  it("pages deterministically with the full matching total, including empty later pages", async () => {
    await withMembers(async (tx, search, ids) => {
      const first = await service.listMembers({ search, page: 1, pageSize: 2 }, tx);
      const second = await service.listMembers({ search, page: 2, pageSize: 2 }, tx);
      const expected = [ids[0]!, ids[1]!, ...ids.slice(2).sort()];
      expect([...first.items, ...second.items].map((row) => row.id)).toEqual(expected);
      expect(first.total).toBe(4);
      expect(second.total).toBe(4);
      expect(await service.listMembers({ search, page: 3, pageSize: 2 }, tx)).toEqual({
        items: [],
        total: 4,
      });
      expect(
        await service.listMembers({ search: `absent${search}`, page: 1, pageSize: 2 }, tx)
      ).toEqual({ items: [], total: 0 });
      expect(memberListSchema.safeParse(first).success).toBe(true);
    });
  });

  it("finds partial case-insensitive first names, last names, and emails", async () => {
    await withMembers(async (tx, marker, ids) => {
      // Only one field in each record contains this particular middle substring.
      for (const [search, expected] of [
        [`fore${marker}AFT`, ids.slice(0, 3)],
        [`before${marker}after@`, [ids[2]!]],
      ] as const) {
        const result = await service.listMembers(
          { search: search.toUpperCase(), page: 1, pageSize: 50 },
          tx
        );
        expect(result.items.map((row) => row.id).sort()).toEqual([...expected].sort());
        expect(result.total).toBe(expected.length);
      }
    });
  });

  it("combines search and each status and counts only matching rows", async () => {
    await withMembers(async (tx, search, ids) => {
      for (const status of ["active", "alumni"] as const) {
        const result = await service.listMembers({ search, status, page: 1, pageSize: 1 }, tx);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.status).toBe(status);
        expect(result.total).toBe(status === "active" ? 3 : 1);
        if (status === "alumni") expect(result.items[0]?.id).toBe(ids[1]!);
      }
    });
  });

  it("treats percent, underscore, backslash, and SQL-like input literally", async () => {
    await withMembers(async (tx, marker, ids) => {
      for (const suffix of ["%", "_", "\\", "' OR 1=1 --"]) {
        const search = `${marker}${suffix}`;
        await tx.update(members).set({ firstName: search }).where(eq(members.id, ids[0]!));
        const result = await service.listMembers({ search, page: 1, pageSize: 50 }, tx);
        expect(result.items.map((row) => row.id)).toEqual([ids[0]!]);
        expect(result.total).toBe(1);
      }
    });
  });

  it("returns safe list/detail HTTP responses for a member linked to an auth user", async () => {
    await withMembers(async (tx, search, ids) => {
      const authId = crypto.randomUUID();
      await tx
        .insert(user)
        .values({ id: authId, name: "Fake User", email: `${authId}@example.com` });
      await tx
        .update(members)
        .set({ userId: authId, invitedAt: new Date("2026-11-11T12:00:00Z") })
        .where(eq(members.id, ids[0]!));
      const listMembers = service.listMembers;
      const getMember = service.getMember;
      spyOn(service, "listMembers").mockImplementation((query) => listMembers(query, tx));
      spyOn(service, "getMember").mockImplementation((id) => getMember(id, tx));
      const listResponse = await app.request(`/api/v1/members?search=${search}`);
      const detailResponse = await app.request(`/api/v1/members/${ids[0]}`);
      expect(listResponse.status).toBe(200);
      expect(detailResponse.status).toBe(200);
      const list = await listResponse.json();
      const rawDetail = await detailResponse.json();
      const detail = memberSchema.parse(rawDetail);
      expect(memberListSchema.safeParse(list).success).toBe(true);
      expect(memberSchema.safeParse(detail).success).toBe(true);
      expect(detail.id).toBe(ids[0]!);
      expect(detail.invitedAt).toBe("2026-11-11T12:00:00.000Z");
      for (const value of [list, rawDetail]) {
        expect(JSON.stringify(value)).not.toContain("userId");
        expect(JSON.stringify(value)).not.toContain("user_id");
        expect(JSON.stringify(value)).not.toContain(authId);
      }
    });
  });

  it("returns the standard NOT_FOUND response for an unknown UUID", async () => {
    await withMembers(async (tx) => {
      const getMember = service.getMember;
      spyOn(service, "getMember").mockImplementation((id) => getMember(id, tx));
      const response = await app.request(`/api/v1/members/${crypto.randomUUID()}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "NOT_FOUND", message: "Member not found." },
      });
    });
  });
});
