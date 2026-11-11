import { describe, expect, it } from "bun:test";
import { eq, sql, TransactionRollbackError } from "drizzle-orm";
import { db } from "../src/db";
import { semesters } from "../src/db/schema";
import { env } from "../src/env";
import { makeCurrentSemester } from "../src/services/semesters";

describe.skipIf(!env.DATABASE_URL)("current semester switching", () => {
  it("switches the current semester and keeps exactly one current", async () => {
    try {
      await db.transaction(async (tx) => {
        // Create temporary semesters inside a rollback-only transaction.
        const [first] = await tx
          .insert(semesters)
          .values({
            name: "Test Spring 2097",
            term: "spring",
            year: 2097,
            startsOn: "2097-01-10",
            endsOn: "2097-05-10",
          })
          .returning();

        const [second] = await tx
          .insert(semesters)
          .values({
            name: "Test Fall 2097",
            term: "fall",
            year: 2097,
            startsOn: "2097-08-10",
            endsOn: "2097-12-10",
          })
          .returning();

        expect(first).toBeDefined();
        expect(second).toBeDefined();
        if (!first || !second) throw new Error("Failed to create test semesters.");

        const switched = await makeCurrentSemester(first.id, tx);

        expect(switched.id).toBe(first.id);
        expect(switched.isCurrent).toBe(true);

        const [currentCount] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(semesters)
          .where(eq(semesters.isCurrent, true));

        expect(currentCount?.total).toBe(1);

        const switchedAgain = await makeCurrentSemester(second.id, tx);

        expect(switchedAgain.id).toBe(second.id);
        expect(switchedAgain.isCurrent).toBe(true);

        const [firstAfterSwitch] = await tx
          .select()
          .from(semesters)
          .where(eq(semesters.id, first.id));

        expect(firstAfterSwitch?.isCurrent).toBe(false);

        const repeated = await makeCurrentSemester(second.id, tx);
        expect(repeated.id).toBe(second.id);
        expect(repeated.isCurrent).toBe(true);

        const [finalCount] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(semesters)
          .where(eq(semesters.isCurrent, true));

        expect(finalCount?.total).toBe(1);

        tx.rollback();
      });
    } catch (error) {
      if (!(error instanceof TransactionRollbackError)) throw error;
    }
  });
});
