import { Hono } from "hono";
import type { MeResponse } from "@internal-tool/shared";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../lib/session";

// GET /api/v1/me: the signed-in user. Minimum access: member (TDD 3.2). The member
// record, access role, and positions get added once the members table exists.
export const me = new Hono<AppEnv>().get("/", (c) => {
  const user = c.get("user");
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue.");

  const body: MeResponse = { id: user.id, email: user.email, name: user.name };
  return c.json(body, 200);
});
