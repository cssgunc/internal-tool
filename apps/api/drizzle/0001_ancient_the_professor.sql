CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE TYPE "public"."interest_kind" AS ENUM('project', 'education', 'exec');--> statement-breakpoint
CREATE TABLE "interest_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semester_id" uuid NOT NULL,
	"meeting_id" uuid,
	"email" "citext" NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"interests" "interest_kind"[] NOT NULL,
	"attended" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interest_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semester_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"checkin_token" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interest_meetings_checkin_token_unique" UNIQUE("checkin_token")
);
--> statement-breakpoint
ALTER TABLE "interest_checkins" ADD CONSTRAINT "interest_checkins_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_checkins" ADD CONSTRAINT "interest_checkins_meeting_id_interest_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."interest_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_meetings" ADD CONSTRAINT "interest_meetings_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interest_checkins_semester_email_unique" ON "interest_checkins" USING btree ("semester_id","email");
