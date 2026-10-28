import { randomBytes } from "node:crypto";
import { z } from "zod";

// Every environment variable the API reads goes through here, so a missing or
// malformed value fails loudly at startup instead of halfway through a request.
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    // Optional so the API (and its tests) can start without a database.
    // src/db/index.ts throws if it's missing when the database is actually used.
    DATABASE_URL: z.url().optional(),
    // Signs session cookies and tokens.
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    // The origin browsers use, i.e. the web app, since Next.js forwards /api/* (TDD 3).
    BETTER_AUTH_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const key of ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const) {
      if (!env[key])
        ctx.addIssue({ code: "custom", path: [key], message: "Required in production." });
    }
  })
  .transform((env) => ({
    ...env,
    // Without a secret, a random one is made at startup rather than a fixed one, so a
    // deploy that forgot NODE_ENV=production still can't have its sessions forged.
    // Locally that just means signing in again after the API restarts.
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("base64"),
    BETTER_AUTH_URL: env.BETTER_AUTH_URL ?? "http://localhost:3000",
  }));

export const env = envSchema.parse(process.env);
