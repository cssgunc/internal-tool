import {
  isHoneypotFilled,
  submitInterestRequestSchema,
  submitInterestResponseSchema,
} from "@internal-tool/shared";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { rateLimit } from "../lib/rate-limit";
import { verifyTurnstile } from "../lib/turnstile";
import { validate } from "../lib/validation";
import type { InterestService } from "../services/interest";

export function createPublicInterestRoutes(
  service: InterestService,
  limiter: MiddlewareHandler = rateLimit({ windowMs: 60_000, max: 10 })
) {
  return new Hono().post(
    "/",
    limiter,
    async (c, next) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        // Let validate() produce the standard malformed-JSON response.
        return await next();
      }
      // Check before validation/storage so bots get success even with otherwise invalid fields.
      if (
        body !== null &&
        typeof body === "object" &&
        "website" in body &&
        isHoneypotFilled((body as Record<string, unknown>).website)
      ) {
        return c.json(submitInterestResponseSchema.parse({ success: true }), 201);
      }
      // Hono caches parsed JSON, so validate() can safely read it again.
      await next();
    },
    validate("json", submitInterestRequestSchema),
    verifyTurnstile,
    async (c) => {
      const result = await service.submit(c.req.valid("json"));
      return c.json(submitInterestResponseSchema.parse(result), 201);
    }
  );
}
