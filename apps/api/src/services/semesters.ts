import { asc, count, desc } from "drizzle-orm";
import type { PageQuery, SemesterList } from "@internal-tool/shared";
import type { db } from "../db";
import { semesters } from "../db/schema";

// Anything that can run a select: the shared connection, or a transaction in tests.
type Database = Pick<typeof db, "select">;

// One page of semesters, newest first (TDD 3.2 Lists). Name breaks ties so the order,
// and so the pages, are stable. total counts every semester, not just this page.
export async function listSemesters(
  { page, pageSize }: PageQuery,
  database?: Database
): Promise<SemesterList> {
  // Loaded on first use rather than at the top: src/db throws on import when
  // DATABASE_URL is missing, and the app (and its tests in CI) must load without one.
  const conn = database ?? (await import("../db")).db;

  const items = await conn
    .select({
      id: semesters.id,
      name: semesters.name,
      term: semesters.term,
      year: semesters.year,
      startsOn: semesters.startsOn,
      endsOn: semesters.endsOn,
      isCurrent: semesters.isCurrent,
    })
    .from(semesters)
    .orderBy(desc(semesters.startsOn), asc(semesters.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totals] = await conn.select({ total: count() }).from(semesters);

  return { items, total: totals?.total ?? 0 };
}
