import { DEV_SUBROLES } from "@internal-tool/shared";
import { sql } from "drizzle-orm";
import { pgEnum, pgTable, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { members } from "./members";
import { positions } from "./positions";
import { projects } from "./projects";
import { semesters } from "./semesters";

export const devSubrole = pgEnum("dev_subrole", DEV_SUBROLES);

export const memberPositions = pgTable(
  "member_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => positions.id),
    semesterId: uuid("semester_id")
      .notNull()
      .references(() => semesters.id),
    projectId: uuid("project_id").references(() => projects.id),
    devSubrole: devSubrole("dev_subrole"),
    assignedBy: uuid("assigned_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("member_positions_member_position_semester_unique").on(
      table.memberId,
      table.positionId,
      table.semesterId
    ),
    uniqueIndex("member_positions_one_project_per_semester")
      .on(table.memberId, table.semesterId)
      .where(sql`${table.projectId} IS NOT NULL`),
  ]
);
