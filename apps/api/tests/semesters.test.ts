import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { TransactionRollbackError } from "drizzle-orm";
import { semesterListSchema } from "@internal-tool/shared";
import type { ErrorResponse, SemesterList } from "@internal-tool/shared";
import { app } from "../src/app";
import type { db } from "../src/db";
import { semesters } from "../src/db/schema";
import { env } from "../src/env";
import * as service from "../src/services/semesters";

// Fake data, newest first, the way the service returns it. Stubbing the service
// keeps these route tests running without a database (CI has none).
const list: SemesterList = {
  items: [
    {
      id: "0b6f4f1e-8a7e-4c55-9d3a-2f1b6c9e0a01",
      name: "Fall 2026",
      term: "fall",
      year: 2026,
      startsOn: "2026-08-17",
      endsOn: "2026-12-11",
      isCurrent: true,
    },
    {
      id: "0b6f4f1e-8a7e-4c55-9d3a-2f1b6c9e0a02",
      name: "Spring 2026",
      term: "spring",
      year: 2026,
      startsOn: "2026-01-12",
      endsOn: "2026-05-08",
      isCurrent: false,
    },
  ],
  total: 2,
};

describe("GET /api/v1/semesters", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns the first page of 50 by default, as { items, total }", async () => {
    const listSemesters = spyOn(service, "listSemesters").mockResolvedValue(list);

    const res = await app.request("/api/v1/semesters");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(semesterListSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual(list);
    expect(listSemesters).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
  });

  it("passes page and pageSize from the query string to the service", async () => {
    const listSemesters = spyOn(service, "listSemesters").mockResolvedValue(list);

    const res = await app.request("/api/v1/semesters?page=3&pageSize=200");

    expect(res.status).toBe(200);
    expect(listSemesters).toHaveBeenCalledWith({ page: 3, pageSize: 200 });
  });

  it("returns an empty list when there are no semesters", async () => {
    spyOn(service, "listSemesters").mockResolvedValue({ items: [], total: 0 });

    const res = await app.request("/api/v1/semesters");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], total: 0 });
  });

  it.each([
    ["pageSize", "201"],
    ["pageSize", "0"],
    ["page", "0"],
    ["page", "abc"],
    ["page", "1.5"],
  ])("rejects ?%s=%s with a VALIDATION error", async (field, value) => {
    const listSemesters = spyOn(service, "listSemesters");

    const res = await app.request(`/api/v1/semesters?${field}=${value}`);

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error.code).toBe("VALIDATION");
    expect(Object.keys(body.error.fields ?? {})).toEqual([field]);
    expect(listSemesters).not.toHaveBeenCalled();
  });
});

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Runs the real query, so it needs a database: it runs in the devcontainer and is
// skipped in CI. Everything happens in a transaction that is rolled back, so local
// data is never changed. Test semesters are far in the future so they sort ahead of
// any real ones.
describe.skipIf(!env.DATABASE_URL)("listSemesters against the database", () => {
  async function withTestSemesters(run: (tx: Transaction) => Promise<void>) {
    const { db: database } = await import("../src/db");
    try {
      await database.transaction(async (tx) => {
        // Inserted out of order on purpose. The two fall semesters start on the same day.
        await tx.insert(semesters).values([
          {
            name: "Test Fall 2991 B",
            term: "fall",
            year: 2991,
            startsOn: "2991-08-20",
            endsOn: "2991-12-10",
          },
          {
            name: "Test Spring 2992",
            term: "spring",
            year: 2992,
            startsOn: "2992-01-12",
            endsOn: "2992-05-08",
          },
          {
            name: "Test Fall 2991 A",
            term: "fall",
            year: 2991,
            startsOn: "2991-08-20",
            endsOn: "2991-12-10",
          },
        ]);
        await run(tx);
        tx.rollback();
      });
    } catch (error) {
      if (!(error instanceof TransactionRollbackError)) throw error;
    }
  }

  it("sorts newest first, breaks ties by name, and pages with the full total", async () => {
    await withTestSemesters(async (tx) => {
      const firstPage = await service.listSemesters({ page: 1, pageSize: 2 }, tx);
      const secondPage = await service.listSemesters({ page: 2, pageSize: 2 }, tx);
      const everything = await service.listSemesters({ page: 1, pageSize: 200 }, tx);

      expect(firstPage.items.map((s) => s.name)).toEqual(["Test Spring 2992", "Test Fall 2991 A"]);
      expect(secondPage.items[0]?.name).toBe("Test Fall 2991 B");
      // total is every row (test rows plus any local ones), not the page length of 2.
      expect(firstPage.total).toBe(everything.items.length);
      expect(firstPage.total).toBeGreaterThanOrEqual(3);
      expect(semesterListSchema.safeParse(firstPage).success).toBe(true);
    });
  });
});
