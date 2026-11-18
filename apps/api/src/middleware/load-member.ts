import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { members } from "../db/schema";
import type { AppEnv } from "../lib/session";
import type { AccessEnv } from "./access";

// Loads the active member for the signed-in user.
// Alumni and users without member records receive no member access.
export const loadMember = createMiddleware<AppEnv & AccessEnv>(async (c, next) => {
  c.set("member", undefined);

  const user = c.get("user");

  if (user) {
    const { db } = await import("../db");

    const [member] = await db
      .select({
        id: members.id,
        isSuperuser: members.isSuperuser,
      })
      .from(members)
      .where(and(eq(members.userId, user.id), eq(members.status, "active")))
      .limit(1);

    if (member) {
      c.set("member", {
        id: member.id,
        isSuperuser: member.isSuperuser,
        // TODO(auth): Load current member positions when #27 lands.
        positions: [],
      });
    }
  }

  await next();
});
