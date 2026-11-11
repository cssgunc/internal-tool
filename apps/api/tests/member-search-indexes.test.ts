import { describe, expect, it } from "bun:test";
import { ilike, or, sql, TransactionRollbackError } from "drizzle-orm";
import type { db } from "../src/db";
import { members } from "../src/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// These expressions must also be used by the Members API search queries.
const searchColumns = [
  { expression: sql`${members.firstName}`, indexName: "members_first_name_trgm_idx" },
  { expression: sql`${members.lastName}`, indexName: "members_last_name_trgm_idx" },
  { expression: sql`${members.email}::text`, indexName: "members_email_trgm_idx" },
];

async function withMembers(
  run: (tx: Transaction, pattern: string, ids: string[]) => Promise<void>
) {
  const { db: database } = await import("../src/db");
  try {
    await database.transaction(async (tx) => {
      const marker = `Trigram${crypto.randomUUID().replaceAll("-", "")}`;
      const rows = await tx
        .insert(members)
        .values([
          {
            firstName: `Before${marker}After`,
            lastName: "Example",
            email: `${crypto.randomUUID()}@example.com`,
          },
          {
            firstName: "Example",
            lastName: `Before${marker}After`,
            email: `${crypto.randomUUID()}@example.com`,
          },
          { firstName: "Example", lastName: "Other", email: `before${marker}after@example.com` },
        ])
        .returning({ id: members.id });
      await run(
        tx,
        `%${marker.toUpperCase()}%`,
        rows.map((row) => row.id)
      );
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

describe("member search database support", () => {
  it("installs pg_trgm through the migration", async () => {
    const { db: database } = await import("../src/db");
    const rows = await database.execute(
      sql`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`
    );
    expect(rows).toHaveLength(1);
  });

  it("creates three valid GIN trigram indexes, including email's text cast", async () => {
    const { db: database } = await import("../src/db");
    const rows = await database.execute<{
      name: string;
      definition: string;
      valid: boolean;
      method: string;
      operator_class: string;
    }>(sql`
      SELECT idx.relname AS name, pg_get_indexdef(i.indexrelid) AS definition,
             i.indisvalid AS valid, am.amname AS method, op.opcname AS operator_class
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_am am ON am.oid = idx.relam
      JOIN pg_opclass op ON op.oid = i.indclass[0]
      WHERE i.indrelid = 'public.members'::regclass
        AND idx.relname IN ('members_first_name_trgm_idx', 'members_last_name_trgm_idx', 'members_email_trgm_idx')
    `);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.valid).toBe(true);
      expect(row.method).toBe("gin");
      expect(row.operator_class).toBe("gin_trgm_ops");
    }
    expect(rows.find((row) => row.name === "members_email_trgm_idx")?.definition).toMatch(
      /email.*::text/
    );
  });

  for (const [position, column] of searchColumns.entries()) {
    it(`matches case-insensitive substrings using ${column.indexName}'s expression`, async () => {
      await withMembers(async (tx, pattern, ids) => {
        const rows = await tx
          .select({ id: members.id })
          .from(members)
          .where(ilike(column.expression, pattern));
        expect(rows.map((row) => row.id)).toEqual([ids[position]!]);
      });
    });

    it(`makes ${column.indexName} eligible for ILIKE queries`, async () => {
      await withMembers(async (tx, pattern) => {
        // A tiny table may reasonably use a sequential scan. Force it off only in
        // this rolled-back transaction to verify index eligibility, not planner preference.
        await tx.execute(sql`SET LOCAL enable_seqscan = off`);
        const plan = await tx.execute(sql`
          EXPLAIN (FORMAT JSON) SELECT id FROM members
          WHERE ${column.expression} ILIKE ${pattern}
        `);
        expect(JSON.stringify(plan)).toContain(column.indexName);
      });
    });
  }

  it("combines the three expressions with OR without losing matches", async () => {
    await withMembers(async (tx, pattern, ids) => {
      const rows = await tx
        .select({ id: members.id })
        .from(members)
        .where(or(...searchColumns.map((column) => ilike(column.expression, pattern))));
      expect(rows.map((row) => row.id).sort()).toEqual([...ids].sort());
    });
  });
});
