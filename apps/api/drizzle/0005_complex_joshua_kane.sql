CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "members_first_name_trgm_idx" ON "members" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "members_last_name_trgm_idx" ON "members" USING gin ("last_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "members_email_trgm_idx" ON "members" USING gin (("email"::text) gin_trgm_ops);
