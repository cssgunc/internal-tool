import { EMAIL_KINDS } from "@internal-tool/shared";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { members } from "./members";

// Built from the shared list, so the database enum and the API can't drift apart.
export const emailKindEnum = pgEnum("email_kind", EMAIL_KINDS);

// One editable template per email kind (TDD 2.3, TDD 3.1 Recruiting).
export const emailTemplates = pgTable("email_templates", {
  kind: emailKindEnum("kind").primaryKey(),

  subject: text("subject").notNull(),

  body: text("body").notNull(),

  // NULL until someone edits it (the seed writes the defaults). TODO(auth): set from
  // the session once sessions are linked to members.
  updatedBy: uuid("updated_by").references(() => members.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});
