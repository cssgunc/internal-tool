CREATE TYPE "public"."email_kind" AS ENUM('invite', 'password_reset', 'applications_open', 'closing_reminder', 'exec_rejection', 'returner_congrats', 'education_congrats', 'rejection');--> statement-breakpoint
CREATE TABLE "email_templates" (
	"kind" "email_kind" PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
