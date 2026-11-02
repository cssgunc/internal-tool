import type { MiddlewareHandler } from "hono";
import { env } from "../env";
import { errorResponse } from "./errors";

/** Reads JSON turnstileToken; Hono caches the body for subsequent schema validation. */
export const verifyTurnstile: MiddlewareHandler = async (c, next) => {
  const invalid = () =>
    c.json(
      errorResponse("VALIDATION", "Verification failed.", {
        turnstileToken: "Complete the verification and try again.",
      }),
      400
    );
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return invalid();
  }
  const token =
    body && typeof body === "object" && "turnstileToken" in body ? body.turnstileToken : undefined;
  if (typeof token !== "string" || !token.trim() || token.length > 2048) return invalid();
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!response.ok) return invalid();
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== "object" ||
      !("success" in result) ||
      result.success !== true
    ) {
      return invalid();
    }
  } catch {
    return invalid();
  }
  await next();
};
