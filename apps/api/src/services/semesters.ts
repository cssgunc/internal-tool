import { asc, count, desc, eq, sql } from "drizzle-orm";
import type {
  CreateSemesterInput,
  PageQuery,
  Semester,
  SemesterList,
  UpdateSemesterDatesInput,
} from "@internal-tool/shared";
import type { db } from "../db";
import { semesters } from "../db/schema";
import { ApiError } from "../lib/errors";

type Database = Pick<typeof db, "select">;

const semesterColumns = {
  id: semesters.id,
  name: semesters.name,
  term: semesters.term,
  year: semesters.year,
  startsOn: semesters.startsOn,
  endsOn: semesters.endsOn,
  isCurrent: semesters.isCurrent,
};

async function getDatabase() {
  return (await import("../db")).db;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const value = error as { code?: string; cause?: unknown };

  return value.code === "23505" || (value.cause !== undefined && isUniqueViolation(value.cause));
}

export async function listSemesters(
  { page, pageSize }: PageQuery,
  database?: Database
): Promise<SemesterList> {
  const conn = database ?? (await getDatabase());

  const items = await conn
    .select(semesterColumns)
    .from(semesters)
    .orderBy(desc(semesters.startsOn), asc(semesters.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totals] = await conn.select({ total: count() }).from(semesters);

  return { items, total: totals?.total ?? 0 };
}

export async function createSemester(input: CreateSemesterInput): Promise<Semester> {
  const database = await getDatabase();

  const name = `${input.term === "fall" ? "Fall" : "Spring"} ${input.year}`;

  try {
    const [created] = await database
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
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "CONFLICT", "A semester with this term and year already exists.");
    }

    throw error;
  }
}

export async function updateSemesterDates(
  id: string,
  input: UpdateSemesterDatesInput
): Promise<Semester> {
  const database = await getDatabase();

  const [updated] = await database
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
    // Serialize concurrent semester switches.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 29)`);

    const [target] = await tx
      .select(semesterColumns)
      .from(semesters)
      .where(eq(semesters.id, id))
      .limit(1);

    if (!target) {
      throw new ApiError(404, "NOT_FOUND", "Semester not found.");
    }

    // Repeated requests do not change anything.
    if (target.isCurrent) {
      return target;
    }

    // Both updates happen inside the same transaction.
    // Other connections never see the intermediate state.
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
