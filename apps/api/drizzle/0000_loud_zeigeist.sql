CREATE TYPE "public"."semester_term" AS ENUM('fall', 'spring');--> statement-breakpoint
CREATE TABLE "semesters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"term" "semester_term" NOT NULL,
	"year" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semesters_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "semesters_one_current" ON "semesters" USING btree ("is_current") WHERE "semesters"."is_current";