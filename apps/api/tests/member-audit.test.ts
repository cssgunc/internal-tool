import { describe, expect, it } from "bun:test";
import { and, eq, TransactionRollbackError } from "drizzle-orm";
import type { db } from "../src/db";
import { auditLog } from "../src/db/schema";
import { createMember, updateMember } from "../src/services/members";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Runs against the real database and rolls everything back.
async function inRolledBackTransaction(run: (tx: Transaction) => Promise<void>) {
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

function entriesFor(tx: Transaction, memberId: string) {
  return tx
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.targetType, "member"), eq(auditLog.targetId, memberId)))
    .orderBy(auditLog.id);
}

const newMember = () => ({
  firstName: "Fake",
  lastName: "Member",
  email: `${crypto.randomUUID()}@example.com`,
});

describe("member audit entries (TDD 2.5)", () => {
  it("records member creation with the new values, logged as System", async () => {
    await inRolledBackTransaction(async (tx) => {
      const request = newMember();
      const member = await createMember(request, tx);

      const [entry, ...rest] = await entriesFor(tx, member.id);
      expect(rest).toHaveLength(0);
      expect(entry).toMatchObject({
        action: "member.create",
        actorMemberId: null,
        actorLabel: "System",
        changes: {
          firstName: { old: null, new: "Fake" },
          lastName: { old: null, new: "Member" },
          email: { old: null, new: request.email },
        },
      });
    });
  });

  it("records only the fields an edit changed", async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await createMember(newMember(), tx);

      await updateMember(member.id, { firstName: "Renamed", lastName: "Member" }, tx);

      const entries = await entriesFor(tx, member.id);
      expect(entries.map((entry) => entry.action)).toEqual(["member.create", "member.update"]);
      expect(entries[1]!.changes).toEqual({ firstName: { old: "Fake", new: "Renamed" } });
    });
  });

  it("records nothing for an edit that changes nothing", async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await createMember(newMember(), tx);

      await updateMember(member.id, { firstName: "Fake" }, tx);

      expect((await entriesFor(tx, member.id)).map((entry) => entry.action)).toEqual([
        "member.create",
      ]);
    });
  });

  it("records nothing when the member doesn't exist", async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = crypto.randomUUID();
      await tx.transaction(async (savepoint) => {
        await expect(updateMember(id, { firstName: "X" }, savepoint)).rejects.toMatchObject({
          status: 404,
        });
      });
      expect(await entriesFor(tx, id)).toHaveLength(0);
    });
  });
});
