import { asc, desc } from "drizzle-orm";
import type { SemesterList } from "@internal-tool/shared";
import { semesters } from "../db/schema";

// Newest semester first (TDD 3.2 Lists). Name breaks ties so the order is stable.
export async function listSemesters(): Promise<SemesterList> {
  // Loaded on first use rather than at the top: src/db throws on import when
  // DATABASE_URL is missing, and the app (and its tests in CI) must load without one.
  const { db } = await import("../db");

  const items = await db
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
    .orderBy(desc(semesters.startsOn), asc(semesters.name));

  return { items, total: items.length };
}
