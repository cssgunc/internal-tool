import { DrizzleQueryError } from "drizzle-orm";
import postgres from "postgres";

/**
 * Checks whether a database error was caused by a specific
 * PostgreSQL unique constraint.
 */
export function isUniqueConstraintViolation(error: unknown, constraint: string): boolean {
  if (error instanceof DrizzleQueryError) {
    return isUniqueConstraintViolation(error.cause, constraint);
  }

  if (error instanceof postgres.PostgresError) {
    return error.code === "23505" && error.constraint_name === constraint;
  }

  return false;
}
