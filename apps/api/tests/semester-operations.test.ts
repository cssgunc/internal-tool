import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { semesters } from "../src/db/schema";
import { env } from "../src/env";
import { ApiError } from "../src/lib/errors";
import { createSemester, updateSemesterDates } from "../src/services/semesters";

const testYear = 2099;
let testSemesterId: string | undefined;

async function cleanup() {
  if (!testSemesterId) return;

  await db.delete(semesters).where(eq(semesters.id, testSemesterId));
  testSemesterId = undefined;
}

describe.skipIf(!env.DATABASE_URL)("semester database operations", () => {
  beforeAll(async () => {
    const existing = await db
      .select({ id: semesters.id })
      .from(semesters)
      .where(eq(semesters.name, `Fall ${testYear}`))
      .limit(1);

    if (existing.length > 0) {
      throw new Error(
        `Fall ${testYear} already exists. Choose an unused test year before running these tests.`
      );
    }
  });

  afterAll(cleanup);

  it("creates a semester with an automatically generated name", async () => {
    const created = await createSemester({
      term: "fall",
      year: testYear,
      startsOn: "2099-08-20",
      endsOn: "2099-12-10",
    });

    testSemesterId = created.id;

    expect(created.name).toBe("Fall 2099");
    expect(created.term).toBe("fall");
    expect(created.year).toBe(testYear);
    expect(created.isCurrent).toBe(false);
  });

  it("rejects duplicate semesters with 409 CONFLICT", async () => {
    expect(testSemesterId).toBeDefined();

    try {
      await createSemester({
        term: "fall",
        year: testYear,
        startsOn: "2099-08-20",
        endsOn: "2099-12-10",
      });

      throw new Error("Expected a duplicate conflict.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);

      if (error instanceof ApiError) {
        expect(error.status).toBe(409);
        expect(error.code).toBe("CONFLICT");
      }
    }
  });

  it("updates semester dates", async () => {
    expect(testSemesterId).toBeDefined();
    if (!testSemesterId) return;

    const updated = await updateSemesterDates(testSemesterId, {
      startsOn: "2099-08-25",
      endsOn: "2099-12-15",
    });

    expect(updated.startsOn).toBe("2099-08-25");
    expect(updated.endsOn).toBe("2099-12-15");
  });

  it("returns 404 when updating a nonexistent semester", async () => {
    try {
      await updateSemesterDates("00000000-0000-4000-8000-000000000001", {
        startsOn: "2099-08-20",
        endsOn: "2099-12-10",
      });

      throw new Error("Expected a not-found error.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);

      if (error instanceof ApiError) {
        expect(error.status).toBe(404);
        expect(error.code).toBe("NOT_FOUND");
      }
    }
  });
});
