import { afterEach, beforeAll, describe, expect, expectTypeOf, it, mock, spyOn } from "bun:test";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { auditLogListSchema } from "@internal-tool/shared";
import type {
  AuditLogEntry,
  AuditLogList,
  AuditLogQuery,
  ErrorResponse,
} from "@internal-tool/shared";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { api as webApi } from "../../web/src/lib/api";
import { app } from "../src/app";
import type { db } from "../src/db";
import { auditLog, interestMeetings, semesters } from "../src/db/schema";
import { env } from "../src/env";
import * as audit from "../src/services/audit";
import {
  createInterestMeetingService,
  createInterestMeetingStore,
} from "../src/services/interest-meetings";
import type { InterestMeetingStore } from "../src/services/interest-meetings";

describe("diffChanges", () => {
  it("returns only the fields that changed", () => {
    const before = { title: "Kickoff", room: "SN 014", seats: 40 };
    const after = { title: "Fall Kickoff", room: "SN 014", seats: 60 };

    expect(audit.diffChanges(before, after)).toEqual({
      title: { old: "Kickoff", new: "Fall Kickoff" },
      seats: { old: 40, new: 60 },
    });
  });

  it("returns {} when nothing changed", () => {
    expect(audit.diffChanges({ title: "Kickoff" }, { title: "Kickoff" })).toEqual({});
  });

  it("treats a null before as a new record and a null after as a deleted one", () => {
    expect(audit.diffChanges(null, { title: "Kickoff", notes: null })).toEqual({
      title: { old: null, new: "Kickoff" },
    });
    expect(audit.diffChanges({ title: "Kickoff" }, null)).toEqual({
      title: { old: "Kickoff", new: null },
    });
  });

  it("includes fields that were added or removed", () => {
    expect(audit.diffChanges({ pronouns: "she/her" }, { githubUsername: "jdoe" })).toEqual({
      pronouns: { old: "she/her", new: null },
      githubUsername: { old: null, new: "jdoe" },
    });
  });

  it("treats undefined, null, and a missing field as the same", () => {
    expect(audit.diffChanges({ notes: undefined }, { notes: null })).toEqual({});
    expect(audit.diffChanges({ notes: null }, {})).toEqual({});
  });

  it("compares dates by value and records them as ISO strings", () => {
    const at = "2026-10-28T23:00:00.000Z";
    expect(audit.diffChanges({ startsAt: new Date(at) }, { startsAt: new Date(at) })).toEqual({});
    expect(
      audit.diffChanges({ startsAt: new Date(at) }, { startsAt: new Date("2026-10-29T23:00:00Z") })
    ).toEqual({ startsAt: { old: at, new: "2026-10-29T23:00:00.000Z" } });
  });

  it("compares arrays and objects by their contents", () => {
    const before = { majors: ["CS"], answers: { why: "impact", year: 2028 } };

    expect(
      audit.diffChanges(before, { majors: ["CS"], answers: { year: 2028, why: "impact" } })
    ).toEqual({});
    expect(audit.diffChanges(before, { ...before, majors: ["CS", "Math"] })).toEqual({
      majors: { old: ["CS"], new: ["CS", "Math"] },
    });
  });
});

describe("recordAudit", () => {
  it.each([
    "create",
    "InterestMeeting.create",
    "interest-meeting.create",
    "interest_meeting.create.now",
    "interest_meeting.",
  ])("rejects the action name %p before writing anything", async (action) => {
    const insert = mock(() => {
      throw new Error("insert should not be called");
    });
    const database = { insert } as unknown as Parameters<typeof audit.recordAudit>[1];

    await expect(
      audit.recordAudit({ action, targetType: "test", targetId: "1" }, database)
    ).rejects.toThrow("<resource>.<verb>");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("the audit log is append-only", () => {
  it("has no code in src that updates or deletes audit entries", async () => {
    const src = `${import.meta.dir}/../src`;
    const offenders: string[] = [];
    for await (const file of new Bun.Glob("**/*.ts").scan(src)) {
      const code = await Bun.file(`${src}/${file}`).text();
      if (
        /\.(update|delete)\(\s*auditLog\b/.test(code) ||
        /\b(update|delete\s+from|truncate)\s+"?audit_log\b/i.test(code)
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

const entry: AuditLogList["items"][number] = {
  id: 2,
  actorMemberId: null,
  actorLabel: "System",
  action: "interest_meeting.create",
  targetType: "interest_meeting",
  targetId: "0b6f4f1e-8a7e-4c55-9d3a-2f1b6c9e0a01",
  changes: { title: { old: null, new: "Interest meeting" } },
  scrubbedAt: null,
  createdAt: "2026-10-28T23:00:00.000Z",
};

// The service is stubbed, so these run without a database.
describe("GET /api/v1/audit-log", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns the first page of 50 by default, as { items, total }", async () => {
    const listAuditLog = spyOn(audit, "listAuditLog").mockResolvedValue({
      items: [entry],
      total: 1,
    });

    const res = await app.request("/api/v1/audit-log");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(auditLogListSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({ items: [entry], total: 1 });
    expect(listAuditLog).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
  });

  it("passes every filter from the query string to the service", async () => {
    const listAuditLog = spyOn(audit, "listAuditLog").mockResolvedValue({ items: [], total: 0 });
    const actor = "6d1e2c3b-4a5f-4e6d-8c7b-9a0f1e2d3c4b";
    const query = new URLSearchParams({
      page: "2",
      pageSize: "10",
      actor,
      action: "position.assign",
      targetType: "member",
      targetId: "abc",
      from: "2026-11-01T00:00:00-04:00",
      to: "2026-11-02T00:00:00-05:00",
    });

    const res = await app.request(`/api/v1/audit-log?${query}`);

    expect(res.status).toBe(200);
    expect(listAuditLog).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      actor,
      action: "position.assign",
      targetType: "member",
      targetId: "abc",
      from: "2026-11-01T00:00:00-04:00",
      to: "2026-11-02T00:00:00-05:00",
    });
  });

  it.each([
    ["actor", "actor=not-a-member-id"],
    ["from", "from=yesterday"],
    ["to", "to=2026-11-02"],
    ["to", "from=2026-11-02T00:00:00Z&to=2026-11-01T00:00:00Z"],
    ["to", "from=2026-11-01T00:00:00Z&to=2026-11-01T00:00:00Z"],
    ["action", "action="],
    ["pageSize", "pageSize=201"],
    ["page", "page=0"],
  ])("rejects bad %s (?%s) with a VALIDATION error", async (field, query) => {
    const listAuditLog = spyOn(audit, "listAuditLog");

    const res = await app.request(`/api/v1/audit-log?${query}`);

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error.code).toBe("VALIDATION");
    expect(Object.keys(body.error.fields ?? {})).toEqual([field]);
    expect(listAuditLog).not.toHaveBeenCalled();
  });

  it("preserves the query and response types in the frontend client", () => {
    type List = (typeof webApi.api.v1)["audit-log"]["$get"];
    type Item = InferResponseType<List, 200>["items"][number];
    expectTypeOf<InferRequestType<List>["query"]["actor"]>().toEqualTypeOf<string | undefined>();
    // Hono types the JSON values in `changes` as its own JSONValue instead of unknown.
    expectTypeOf<Omit<Item, "changes">>().toEqualTypeOf<Omit<AuditLogEntry, "changes">>();
    expectTypeOf<null>().toExtend<Item["changes"]>();
    expectTypeOf<InferResponseType<List, 200>["total"]>().toEqualTypeOf<number>();
    expectTypeOf<InferResponseType<List, 400>>().toEqualTypeOf<ErrorResponse>();
  });
});

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// These run against a real database: CI starts Postgres and runs the migrations, and
// the devcontainer has one too. Everything happens in transactions that are rolled
// back, and each run uses its own target type, so other entries never interfere.
describe("audit log against the database", () => {
  const targetType = `test_${crypto.randomUUID().slice(0, 8)}`;
  const page = (query: Partial<AuditLogQuery>): AuditLogQuery => ({
    page: 1,
    pageSize: 50,
    ...query,
  });

  beforeAll(() => {
    if (!env.DATABASE_URL) {
      throw new Error(
        "The audit log tests need a database: set DATABASE_URL (CI and the devcontainer do)."
      );
    }
  });

  async function rolledBack(run: (tx: Transaction) => Promise<void>) {
    const { db: database } = await import("../src/db");
    try {
      await database.transaction(async (tx) => {
        await run(tx);
        tx.rollback();
      });
    } catch (error) {
      if (!(error instanceof TransactionRollbackError)) throw error;
    }
  }

  it("leaves no entry when the transaction it was written in rolls back", async () => {
    const targetId = crypto.randomUUID();

    await rolledBack(async (tx) => {
      await audit.recordAudit({ action: "test_thing.create", targetType, targetId }, tx);
      expect((await audit.listAuditLog(page({ targetType, targetId }), tx)).total).toBe(1);
    });

    expect((await audit.listAuditLog(page({ targetType, targetId }))).total).toBe(0);
  });

  it("logs a missing actor as System and snapshots an actor's name", async () => {
    const memberId = crypto.randomUUID();

    await rolledBack(async (tx) => {
      await audit.recordAudit({ action: "test_thing.create", targetType, targetId: "1" }, tx);
      await audit.recordAudit(
        {
          actor: { memberId, label: "Jane Doe" },
          action: "test_thing.edit",
          targetType,
          targetId: "1",
          changes: { title: { old: "Kickoff", new: "Fall Kickoff" } },
        },
        tx
      );

      const { items } = await audit.listAuditLog(page({ targetType }), tx);
      // Both share the transaction's created_at, so the later id comes first.
      expect(items).toMatchObject([
        {
          actorMemberId: memberId,
          actorLabel: "Jane Doe",
          action: "test_thing.edit",
          changes: { title: { old: "Kickoff", new: "Fall Kickoff" } },
          scrubbedAt: null,
        },
        { actorMemberId: null, actorLabel: "System", action: "test_thing.create", changes: null },
      ]);
      expect(items[0]!.id).toBeGreaterThan(items[1]!.id);
      expect(auditLogListSchema.safeParse({ items, total: 2 }).success).toBe(true);
    });
  });

  // Entries A, B, C (oldest to newest) of this run's target type, plus D of another
  // type. Inserted directly so each can have its own created_at.
  const memberA = crypto.randomUUID();
  const memberB = crypto.randomUUID();

  async function withEntries(run: (tx: Transaction) => Promise<void>) {
    await rolledBack(async (tx) => {
      await tx.insert(auditLog).values([
        {
          actorMemberId: memberA,
          actorLabel: "A",
          action: "test_thing.create",
          targetType,
          targetId: "t1",
          createdAt: new Date("2991-01-01T10:00:00Z"),
        },
        {
          actorMemberId: memberB,
          actorLabel: "B",
          action: "test_thing.edit",
          targetType,
          targetId: "t1",
          createdAt: new Date("2991-01-02T10:00:00Z"),
        },
        {
          actorLabel: "C",
          action: "test_thing.edit",
          targetType,
          targetId: "t2",
          createdAt: new Date("2991-01-03T10:00:00Z"),
        },
        {
          actorMemberId: memberA,
          actorLabel: "D",
          action: "test_thing.edit",
          targetType: `${targetType}_other`,
          targetId: "t1",
          createdAt: new Date("2991-01-04T10:00:00Z"),
        },
      ]);
      await run(tx);
    });
  }

  it.each([
    ["target type", {}, ["C", "B", "A"]],
    ["actor", { actor: memberB }, ["B"]],
    ["action", { action: "test_thing.edit" }, ["C", "B"]],
    ["target id", { targetId: "t1" }, ["B", "A"]],
    ["from (inclusive)", { from: "2991-01-02T10:00:00Z" }, ["C", "B"]],
    ["to (exclusive)", { to: "2991-01-02T10:00:00Z" }, ["A"]],
    ["date range", { from: "2991-01-02T00:00:00Z", to: "2991-01-03T00:00:00Z" }, ["B"]],
    ["action and actor together", { action: "test_thing.edit", actor: memberB }, ["B"]],
  ] as const)("filters by %s, newest first", async (_name, filters, expected) => {
    await withEntries(async (tx) => {
      const result = await audit.listAuditLog(page({ targetType, ...filters }), tx);
      expect(result.items.map((item) => item.actorLabel)).toEqual([...expected]);
      expect(result.total).toBe(expected.length);
    });
  });

  it("returns timestamps as ISO strings, including scrubbedAt", async () => {
    await rolledBack(async (tx) => {
      await tx.insert(auditLog).values({
        actorLabel: "System",
        action: "retention.wipe",
        targetType,
        targetId: "scrubbed",
        scrubbedAt: new Date("2991-02-01T05:00:00Z"),
        createdAt: new Date("2991-01-05T10:00:00Z"),
      });

      const { items } = await audit.listAuditLog(page({ targetType }), tx);
      expect(items).toMatchObject([
        { scrubbedAt: "2991-02-01T05:00:00.000Z", createdAt: "2991-01-05T10:00:00.000Z" },
      ]);
      expect(auditLogListSchema.safeParse({ items, total: 1 }).success).toBe(true);
    });
  });

  it("filters by actor across target types", async () => {
    await withEntries(async (tx) => {
      const result = await audit.listAuditLog(page({ actor: memberA }), tx);
      expect(result.items.map((item) => item.actorLabel)).toEqual(["D", "A"]);
    });
  });

  it("pages newest first with the full total", async () => {
    await withEntries(async (tx) => {
      const pages = await Promise.all(
        [1, 2, 3].map((n) => audit.listAuditLog(page({ targetType, page: n, pageSize: 2 }), tx))
      );
      expect(pages.map((p) => p.items.map((item) => item.actorLabel))).toEqual([
        ["C", "B"],
        ["A"],
        [],
      ]);
      expect(pages.map((p) => p.total)).toEqual([3, 3, 3]);
    });
  });

  describe("creating an interest meeting", () => {
    // A current semester for the meeting, replacing any local one inside the transaction.
    async function withCurrentSemester(tx: Transaction) {
      await tx.update(semesters).set({ isCurrent: false }).where(eq(semesters.isCurrent, true));
      await tx.insert(semesters).values({
        name: `Test ${targetType}`,
        term: "fall",
        year: 2991,
        startsOn: "2991-08-20",
        endsOn: "2991-12-10",
        isCurrent: true,
      });
    }
    const request = { title: `Audit test ${targetType}`, startsAt: "2991-09-01T19:00:00-04:00" };

    it("saves the meeting and its audit entry together", async () => {
      await rolledBack(async (tx) => {
        await withCurrentSemester(tx);
        const service = createInterestMeetingService(createInterestMeetingStore(tx));

        const { id } = await service.createMeeting(request);

        const { items } = await audit.listAuditLog(
          page({ targetType: "interest_meeting", targetId: id }),
          tx
        );
        expect(items).toMatchObject([
          {
            actorMemberId: null,
            actorLabel: "System",
            action: "interest_meeting.create",
            changes: {
              title: { old: null, new: request.title },
              startsAt: { old: null, new: "2991-09-01T23:00:00.000Z" },
            },
          },
        ]);
      });
    });

    it("saves no meeting when the audit entry fails", async () => {
      await rolledBack(async (tx) => {
        await withCurrentSemester(tx);
        const store = createInterestMeetingStore(tx);
        const failingAudit: InterestMeetingStore = {
          ...store,
          transaction: (work) =>
            store.transaction((inner) =>
              work({
                ...inner,
                recordAudit: async () => {
                  throw new Error("audit insert failed");
                },
              })
            ),
        };

        await expect(
          createInterestMeetingService(failingAudit).createMeeting(request)
        ).rejects.toThrow("audit insert failed");

        const saved = await tx
          .select()
          .from(interestMeetings)
          .where(eq(interestMeetings.title, request.title));
        expect(saved).toHaveLength(0);
      });
    });
  });
});
