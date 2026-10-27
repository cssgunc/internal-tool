import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const memberStatus = pgEnum("member_status", ["active", "alumni"]);

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  displayName: text("display_name"),
  email: citext("email").notNull().unique(),
  otherEmails: citext("other_emails")
    .array()
    .notNull()
    .default(sql`'{}'::citext[]`),
  pronouns: text("pronouns"),
  gradYear: integer("grad_year"),
  majors: text("majors")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  minors: text("minors")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  githubUsername: citext("github_username").unique(),
  linkedinUrl: text("linkedin_url"),
  portfolioUrl: text("portfolio_url"),
  isSuperuser: boolean("is_superuser").notNull().default(false),
  status: memberStatus("status").notNull().default("active"),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
