CREATE TYPE "public"."position_category" AS ENUM('exec', 'project', 'education');--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "position_category" NOT NULL,
	"grants_exec" boolean NOT NULL,
	"seat_limit" integer,
	"per_project" boolean DEFAULT false NOT NULL,
	"requires_account" boolean DEFAULT true NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_name_unique" UNIQUE("name")
);
