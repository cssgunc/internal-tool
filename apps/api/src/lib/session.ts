import { getSessionCookie } from "better-auth/cookies";
import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import type { AuthSession, AuthUser } from "./auth";

// What every /api/v1 route can read with c.get("user") / c.get("session").
// Both are null when nobody is signed in.
export type AppEnv = {
  Variables: {
    user: AuthUser | null;
    session: AuthSession | null;
  };
};

// Puts the signed-in user (or null) on the request context for every route.
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", null);
  c.set("session", null);

  // No session cookie means signed out, so skip the database lookup entirely.
  if (getSessionCookie(c.req.raw.headers)) {
    const auth = await getAuth();
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (result) {
      c.set("user", result.user);
      c.set("session", result.session);
    }
  }

  await next();
});
