import { randomBytes } from "node:crypto";
import { z } from "zod";

// Every environment variable the API reads goes through here, so a missing or
// malformed value fails loudly at startup instead of halfway through a request.
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    // Optional so the API (and its tests) can start without a database.
    // src/db/index.ts throws if it's missing when the database is actually used.
    DATABASE_URL: z.url().optional(),
    TURNSTILE_SECRET_KEY: z.string().trim().min(1).optional(),
    // Opt in only when the listener is behind Railway's public HTTP edge.
    CLIENT_IP_SOURCE: z.enum(["socket", "railway"]).default("socket"),
    // Signs session cookies and tokens.
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    // The origin browsers use, i.e. the web app, since Next.js forwards /api/* (TDD 3).
    BETTER_AUTH_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (!env.TURNSTILE_SECRET_KEY || /^[123]x0+(AA|AB|BB|FF)$/.test(env.TURNSTILE_SECRET_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["TURNSTILE_SECRET_KEY"],
        message: "Production requires a real Turnstile secret key.",
      });
    }
    for (const key of ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const) {
      if (!env[key])
        ctx.addIssue({ code: "custom", path: [key], message: "Required in production." });
    }
  })
  .transform((env) => ({
    ...env,
    // Cloudflare's published always-pass secret; never a production fallback.
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY ?? "1x0000000000000000000000000000000AA",
    // Without a secret, a random one is made at startup rather than a fixed one, so a
    // deploy that forgot NODE_ENV=production still can't have its sessions forged.
    // Locally that just means signing in again after the API restarts.
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("base64"),
    BETTER_AUTH_URL: env.BETTER_AUTH_URL ?? "http://localhost:3000",
  }));

export const env = envSchema.parse(process.env);
