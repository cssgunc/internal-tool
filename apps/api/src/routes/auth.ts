import { Hono } from "hono";
import { getAuth } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

export const AUTH_RATE_LIMITS = {
  signIn: { windowMs: 60_000, max: 5 },
  requestPasswordReset: { windowMs: 60 * 60_000, max: 3 },
  resetPassword: { windowMs: 60 * 60_000, max: 5 },
} as const;

type AuthRequestHandler = (request: Request) => Promise<Response>;

// Better Auth's own routes (sign-in, sign-out, get-session, ...) under /api/auth/*
// (TDD 3.2 Auth & Session). Better Auth handles the request and the response itself.
export function createAuthRoutes(
  handleRequest: AuthRequestHandler = async (request) => {
    const auth = await getAuth();
    return auth.handler(request);
  }
) {
  const handler = (c: { req: { raw: Request } }) => handleRequest(c.req.raw);

  return new Hono()
    .post("/sign-in/email", rateLimit(AUTH_RATE_LIMITS.signIn), handler)
    .post("/request-password-reset", rateLimit(AUTH_RATE_LIMITS.requestPasswordReset), handler)
    .post("/reset-password", rateLimit(AUTH_RATE_LIMITS.resetPassword), handler)
    .on(["GET", "POST"], "/*", handler);
}

export const authRoutes = createAuthRoutes();
