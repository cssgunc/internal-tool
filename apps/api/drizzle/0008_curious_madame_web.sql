CREATE TYPE "public"."email_kind" AS ENUM('invite', 'password_reset', 'applications_open', 'closing_reminder', 'exec_rejection', 'returner_congrats', 'education_congrats', 'rejection');--> statement-breakpoint
CREATE TABLE "email_templates" (
	"kind" "email_kind" PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_members_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;