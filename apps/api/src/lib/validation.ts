import type { ErrorResponse } from "@internal-tool/shared";
import type { Env, MiddlewareHandler, TypedResponse } from "hono";
import type { z } from "zod";
import { errorResponse } from "./errors";

/** Client input uses the schema's input type; req.valid() returns its parsed output. */
export function validate<Target extends "json" | "query", Schema extends z.ZodType>(
  target: Target,
  schema: Schema
): MiddlewareHandler<
  Env,
  string,
  {
    in: { [Key in Target]: z.input<Schema> };
    out: { [Key in Target]: z.output<Schema> };
  },
  TypedResponse<ErrorResponse, 400, "json">
> {
  return async (c, next) => {
    let value: unknown;
    if (target === "json") {
      try {
        value = await c.req.json();
      } catch {
        return c.json(
          errorResponse("VALIDATION", "Invalid request body.", { _root: "Expected valid JSON." }),
          400
        );
      }
    } else {
      // Preserve repeated query parameters so a schema can validate them as arrays.
      value = Object.fromEntries(
        Object.entries(c.req.queries()).map(([key, values]) => [
          key,
          values.length === 1 ? values[0] : values,
        ])
      );
    }

    const result = await schema.safeParseAsync(value);
    if (!result.success) {
      // Dot paths include nested fields and array indices. Keep the first message per field.
      // Errors without a field path use the reserved _root key.
      const fields = Object.fromEntries(
        result.error.issues
          .map((issue) => [issue.path.map(String).join(".") || "_root", issue.message])
          .reverse()
      );
      return c.json(errorResponse("VALIDATION", "Request validation failed.", fields), 400);
    }

    // Hono's storage signature excludes null/undefined, although it stores any parsed
    // value unchanged. Keep the schema's actual output type in req.valid(), including null.
    c.req.addValidatedData(target, result.data as NonNullable<z.output<Schema>>);
    await next();
  };
}
