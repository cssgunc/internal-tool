import { submitInterestRequestSchema, submitInterestResponseSchema } from "@internal-tool/shared";
import { Hono } from "hono";
import { validate } from "../lib/validation";
import type { InterestService } from "../services/interest";

export function createPublicInterestRoutes(service: InterestService) {
  return new Hono().post(
    "/",
    async (c, next) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        // Let validate() produce the standard malformed-JSON response.
        return await next();
      }
      // TODO(protection): replace this inline check with the shared honeypot helper once merged.
      // Check before validation/storage so bots get success even with otherwise invalid fields.
      if (
        body !== null &&
        typeof body === "object" &&
        "website" in body &&
        typeof body.website === "string" &&
        body.website.length > 0
      ) {
        return c.json(submitInterestResponseSchema.parse({ success: true }), 201);
      }
      // Hono caches parsed JSON, so validate() can safely read it again.
      await next();
    },
    validate("json", submitInterestRequestSchema),
    async (c) => {
      const result = await service.submit(c.req.valid("json"));
      return c.json(submitInterestResponseSchema.parse(result), 201);
    }
  );
}
