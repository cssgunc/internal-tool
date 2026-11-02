CREATE TYPE "public"."member_status" AS ENUM('active', 'alumni');--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"display_name" text,
	"email" "citext" NOT NULL,
	"other_emails" "citext"[] DEFAULT '{}'::citext[] NOT NULL,
	"pronouns" text,
	"grad_year" integer,
	"majors" text[] DEFAULT '{}'::text[] NOT NULL,
	"minors" text[] DEFAULT '{}'::text[] NOT NULL,
	"github_username" "citext",
	"linkedin_url" text,
	"portfolio_url" text,
	"is_superuser" boolean DEFAULT false NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"invited_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "members_email_unique" UNIQUE("email"),
	CONSTRAINT "members_github_username_unique" UNIQUE("github_username")
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;