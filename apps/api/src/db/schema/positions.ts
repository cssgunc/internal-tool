import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const positionCategory = pgEnum("position_category", ["exec", "project", "education"]);

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    category: positionCategory("category").notNull(),
    grantsExec: boolean("grants_exec").notNull(),
    seatLimit: integer("seat_limit"),
    perProject: boolean("per_project").notNull().default(false),
    requiresAccount: boolean("requires_account").notNull().default(true),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "positions_seat_limit_positive",
      sql`${table.seatLimit} IS NULL OR ${table.seatLimit} > 0`
    ),
  ]
);
