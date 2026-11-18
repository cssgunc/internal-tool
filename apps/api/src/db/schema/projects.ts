import { PROJECT_STATUSES } from "@internal-tool/shared";
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { semesters } from "./semesters";

export const projectStatus = pgEnum("project_status", PROJECT_STATUSES);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    semesterId: uuid("semester_id")
      .notNull()
      .references(() => semesters.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    notionUrl: text("notion_url"),
    status: projectStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("projects_semester_slug_unique").on(table.semesterId, table.slug)]
);
