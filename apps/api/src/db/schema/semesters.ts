import { SEMESTER_TERMS } from "@internal-tool/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Example table to show the conventions. Matches `semesters` in TDD 3.1,
// minus the recruiting columns, which come with the recruiting tickets.
// Values come from packages/shared so the API's schema and the database can't drift apart.
export const semesterTerm = pgEnum("semester_term", SEMESTER_TERMS);

export const semesters = pgTable(
  "semesters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(), // "Fall 2026"
    term: semesterTerm("term").notNull(),
    year: integer("year").notNull(),
    startsOn: date("starts_on").notNull(), // retention rules count from this
    endsOn: date("ends_on").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Only one semester can be current at a time.
  (t) => [
    uniqueIndex("semesters_one_current")
      .on(t.isCurrent)
      .where(sql`${t.isCurrent}`),
  ]
);
