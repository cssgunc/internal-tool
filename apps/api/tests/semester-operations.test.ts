import { describe, expect, it } from "bun:test";
import { TransactionRollbackError } from "drizzle-orm";
import type { db } from "../src/db";
import { env } from "../src/env";
import { ApiError } from "../src/lib/errors";
import { createSemester, updateSemesterDates } from "../src/services/semesters";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const testYear = 2099;

async function withRollbackTransaction(run: (tx: Transaction) => Promise<void>): Promise<void> {
  const { db: database } = await import("../src/db");

  try {
    await database.transaction(async (tx) => {
      await run(tx);

      // Always discard the test data rather than committing it.
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) {
      throw error;
    }
  }
}

describe.skipIf(!env.DATABASE_URL)("semester database operations", () => {
  it("creates a semester with an automatically generated name", async () => {
    await withRollbackTransaction(async (tx) => {
      const created = await createSemester(
        {
          term: "fall",
          year: testYear,
          startsOn: "2099-08-20",
          endsOn: "2099-12-10",
        },
        tx
      );

      expect(created.name).toBe("Fall 2099");
      expect(created.term).toBe("fall");
      expect(created.year).toBe(testYear);
      expect(created.isCurrent).toBe(false);
    });
  });

  it("rejects duplicate semesters with 409 CONFLICT", async () => {
    await withRollbackTransaction(async (tx) => {
      const input = {
        term: "fall" as const,
        year: testYear,
        startsOn: "2099-08-20",
        endsOn: "2099-12-10",
      };

      await createSemester(input, tx);

      try {
        await createSemester(input, tx);
        throw new Error("Expected a duplicate conflict.");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);

        if (error instanceof ApiError) {
          expect(error.status).toBe(409);
          expect(error.code).toBe("CONFLICT");
        }
      }
    });
  });

  it("updates semester dates", async () => {
    await withRollbackTransaction(async (tx) => {
      const created = await createSemester(
        {
          term: "fall",
          year: testYear,
          startsOn: "2099-08-20",
          endsOn: "2099-12-10",
        },
        tx
      );

      const updated = await updateSemesterDates(
        created.id,
        {
          startsOn: "2099-08-25",
          endsOn: "2099-12-15",
        },
        tx
      );

      expect(updated.startsOn).toBe("2099-08-25");
      expect(updated.endsOn).toBe("2099-12-15");
    });
  });

  it("returns 404 when updating a nonexistent semester", async () => {
    await withRollbackTransaction(async (tx) => {
      try {
        await updateSemesterDates(
          "00000000-0000-4000-8000-000000000001",
          {
            startsOn: "2099-08-20",
            endsOn: "2099-12-10",
          },
          tx
        );

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
});
