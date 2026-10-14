import { z } from "zod";

// Every environment variable the API reads goes through here, so a missing or
// malformed value fails loudly at startup instead of halfway through a request.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  // Optional so the API (and its tests) can start without a database.
  // src/db/index.ts throws if it's missing when the database is actually used.
  DATABASE_URL: z.url().optional(),
});

export const env = envSchema.parse(process.env);
