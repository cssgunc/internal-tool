import { INTEREST_KINDS } from "@internal-tool/shared";
import {
  boolean,
  customType,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { semesters } from "./semesters";

const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

export const interestKind = pgEnum("interest_kind", INTEREST_KINDS);

export const interestMeetings = pgTable("interest_meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  semesterId: uuid("semester_id")
    .notNull()
    .references(() => semesters.id),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  checkinToken: text("checkin_token").notNull().unique(),
  // TODO(auth): populate from the exec member; add the FK when members exists.
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const interestCheckins = pgTable(
  "interest_checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    semesterId: uuid("semester_id")
      .notNull()
      .references(() => semesters.id),
    meetingId: uuid("meeting_id").references(() => interestMeetings.id),
    email: citext("email").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    interests: interestKind("interests").array().notNull(),
    attended: boolean("attended").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("interest_checkins_semester_email_unique").on(t.semesterId, t.email)]
);
