import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { members } from "../db/schema";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../lib/session";

type SemesterAdminMember = {
  isSuperuser: boolean;
  status: "active" | "alumni";
} | null;

export function canAdministerSemesters(member: SemesterAdminMember): boolean {
  return member !== null && member.isSuperuser && member.status === "active";
}

export const requireSemesterAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");

  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  }

  const { db } = await import("../db");

  const [member] = await db
    .select({
      isSuperuser: members.isSuperuser,
      status: members.status,
    })
    .from(members)
    .where(eq(members.userId, user.id))
    .limit(1);

  if (!canAdministerSemesters(member ?? null)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to this resource.");
  }

  await next();
});
