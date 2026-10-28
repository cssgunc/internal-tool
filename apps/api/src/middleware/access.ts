import type { AccessPosition, AccessRole } from "@internal-tool/shared";
import type { Context, MiddlewareHandler } from "hono";
import { ApiError } from "../lib/errors";
import { deriveAccessRole } from "../services/access";

export type AccessMember = {
  id: string;
  isSuperuser: boolean;
  positions: readonly AccessPosition[];
};

export type AccessEnv = {
  Variables: {
    member?: AccessMember;
  };
};

type AccessContext = Context<AccessEnv>;

const ACCESS_LEVEL: Record<AccessRole, number> = {
  project_member: 1,
  exec: 2,
  superuser: 3,
};

export function requireAccess(minimumRole: AccessRole): MiddlewareHandler<AccessEnv> {
  return async (c, next) => {
    const member = c.get("member");
    if (!member) {
      throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue.");
    }

    const role = deriveAccessRole(member);
    if (!role || ACCESS_LEVEL[role] < ACCESS_LEVEL[minimumRole]) {
      throw new ApiError(403, "FORBIDDEN", "You do not have access to this resource.");
    }

    await next();
  };
}

export function requireSelfOrExec(
  getTargetMemberId: (c: AccessContext) => string | undefined = (c) => c.req.param("memberId")
): MiddlewareHandler<AccessEnv> {
  return async (c, next) => {
    const member = c.get("member");
    if (!member) {
      throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue.");
    }

    const role = deriveAccessRole(member);
    if (member.id !== getTargetMemberId(c) && (!role || ACCESS_LEVEL[role] < ACCESS_LEVEL.exec)) {
      throw new ApiError(403, "FORBIDDEN", "You do not have access to this resource.");
    }

    await next();
  };
}
