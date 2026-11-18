import type {
  CreateSemesterInput,
  PageQuery,
  Semester,
  SemesterList,
  UpdateSemesterDatesInput,
} from "@internal-tool/shared";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import type { db } from "../db";
import { semesters } from "../db/schema";
import { isUniqueConstraintViolation } from "../lib/db-errors";
import { ApiError } from "../lib/errors";

// Accept either the main database or a transaction for database operations.
type Database = Pick<typeof db, "select" | "insert" | "update">;

// Dedicated advisory lock for switching the current semester.
// Keep this key unique across application features.
const SEMESTER_CURRENT_LOCK = [2026, 29] as const;

const semesterColumns = {
  id: semesters.id,
  name: semesters.name,
  term: semesters.term,
  year: semesters.year,
  startsOn: semesters.startsOn,
  endsOn: semesters.endsOn,
  isCurrent: semesters.isCurrent,
};

// Load the database only when needed so tests can supply their own transaction.
async function getDatabase() {
  return (await import("../db")).db;
}

export async function listSemesters(
  { page, pageSize }: PageQuery,
  database?: Pick<Database, "select">
): Promise<SemesterList> {
  const conn = database ?? (await getDatabase());

  // Stable ordering ensures predictable pagination.
  const items = await conn
    .select(semesterColumns)
    .from(semesters)
    .orderBy(desc(semesters.startsOn), asc(semesters.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Count all matching semesters, not just those on this page.
  const [totals] = await conn.select({ total: count() }).from(semesters);

  return { items, total: totals?.total ?? 0 };
}

export async function createSemester(
  input: CreateSemesterInput,
  database?: Pick<Database, "insert">
): Promise<Semester> {
  const conn = database ?? (await getDatabase());

  const name = `${input.term === "fall" ? "Fall" : "Spring"} ${input.year}`;

  try {
    const [created] = await conn
      .insert(semesters)
      .values({
        name,
        term: input.term,
        year: input.year,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      })
      .returning(semesterColumns);

    if (!created) {
      throw new Error("Failed to create semester.");
    }

    return created;
  } catch (error) {
    if (isUniqueConstraintViolation(error, "semesters_name_unique")) {
      throw new ApiError(409, "CONFLICT", "A semester with this term and year already exists.");
    }

    throw error;
  }
}

export async function updateSemesterDates(
  id: string,
  input: UpdateSemesterDatesInput,
  database?: Pick<Database, "update">
): Promise<Semester> {
  const conn = database ?? (await getDatabase());

  const [updated] = await conn
    .update(semesters)
    .set({
      startsOn: input.startsOn,
      endsOn: input.endsOn,
    })
    .where(eq(semesters.id, id))
    .returning(semesterColumns);

  if (!updated) {
    throw new ApiError(404, "NOT_FOUND", "Semester not found.");
  }

  return updated;
}

export async function makeCurrentSemester(
  id: string,
  database?: Pick<typeof db, "transaction">
): Promise<Semester> {
  const conn = database ?? (await getDatabase());

  return conn.transaction(async (tx) => {
    // Serialize concurrent semester switches using a transaction-scoped lock.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${SEMESTER_CURRENT_LOCK[0]}, ${SEMESTER_CURRENT_LOCK[1]})`
    );

    const [target] = await tx
      .select(semesterColumns)
      .from(semesters)
      .where(eq(semesters.id, id))
      .limit(1);

    if (!target) {
      throw new ApiError(404, "NOT_FOUND", "Semester not found.");
    }

    // Making an already-current semester current again is a no-op.
    if (target.isCurrent) {
      return target;
    }

    // Both updates happen atomically. Other connections never see
    // the intermediate state where no semester is current.
    await tx.update(semesters).set({ isCurrent: false }).where(eq(semesters.isCurrent, true));

    const [updated] = await tx
      .update(semesters)
      .set({ isCurrent: true })
      .where(eq(semesters.id, id))
      .returning(semesterColumns);

    if (!updated) {
      throw new Error("Failed to make semester current.");
    }

    return updated;
  });
}
