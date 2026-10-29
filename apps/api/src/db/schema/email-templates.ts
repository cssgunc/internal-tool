import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const emailKindEnum = pgEnum("email_kind", [
  "invite",
  "password_reset",
  "applications_open",
  "closing_reminder",
  "exec_rejection",
  "returner_congrats",
  "education_congrats",
  "rejection",
]);

export const emailTemplates = pgTable("email_templates", {
  kind: emailKindEnum("kind").primaryKey(),

  subject: text("subject").notNull(),

  body: text("body").notNull(),

  // TODO(auth): Add foreign key to members once the members table exists.
  updatedBy: uuid("updated_by"),

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
