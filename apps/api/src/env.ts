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
  })
  .superRefine((value, ctx) => {
    if (
      value.NODE_ENV === "production" &&
      (!value.TURNSTILE_SECRET_KEY || /^[123]x0+(AA|AB|BB|FF)$/.test(value.TURNSTILE_SECRET_KEY))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["TURNSTILE_SECRET_KEY"],
        message: "Production requires a real Turnstile secret key.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    // Cloudflare's published always-pass secret; never a production fallback.
    TURNSTILE_SECRET_KEY: value.TURNSTILE_SECRET_KEY ?? "1x0000000000000000000000000000000AA",
  }));

export const env = envSchema.parse(process.env);
