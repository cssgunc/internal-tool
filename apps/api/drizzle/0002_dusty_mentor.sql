ALTER TYPE "public"."member_status" ADD VALUE 'alumni';--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "other_emails" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "majors" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "minors" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;