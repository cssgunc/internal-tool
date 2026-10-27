CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active');--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"display_name" text,
	"email" "citext" NOT NULL,
	"other_emails" "citext"[] DEFAULT '{}'::citext[],
	"pronouns" text,
	"grad_year" integer,
	"majors" text[] DEFAULT '{}'::text[],
	"minors" text[] DEFAULT '{}'::text[],
	"github_username" "citext",
	"linkedin_url" text,
	"portfolio_url" text,
	"is_superuser" boolean DEFAULT false NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"invited_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	CONSTRAINT "members_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "members_email_unique" UNIQUE("email"),
	CONSTRAINT "members_github_username_unique" UNIQUE("github_username")
);