import { describe, expect, it } from "bun:test";
import type { AccessPosition } from "@internal-tool/shared";
import { Hono, type MiddlewareHandler } from "hono";
import { handleError } from "../src/lib/errors";
import type { AccessEnv, AccessMember } from "../src/middleware/access";
import { requireAccess, requireSelfOrExec } from "../src/middleware/access";
import { checkPositionAssignment, deriveAccessRole } from "../src/services/access";

const noPositions: AccessPosition[] = [];

describe("deriveAccessRole", () => {
  it("returns no access for Education Student only", () => {
    expect(
      deriveAccessRole({
        isSuperuser: false,
        positions: [{ category: "education", grantsExec: false }],
      })
    ).toBeNull();
  });

  it("returns project_member for Developer only", () => {
    expect(
      deriveAccessRole({
        isSuperuser: false,
        positions: [{ category: "project", grantsExec: false }],
      })
    ).toBe("project_member");
  });

  it("returns exec for VP plus Developer", () => {
    expect(
      deriveAccessRole({
        isSuperuser: false,
        positions: [
          { category: "exec", grantsExec: true },
          { category: "project", grantsExec: false },
        ],
      })
    ).toBe("exec");
  });

  it("returns superuser when the member has the superuser flag", () => {
    expect(deriveAccessRole({ isSuperuser: true, positions: noPositions })).toBe("superuser");
  });
});

const developerPosition = {
  id: "developer",
  category: "project",
  grantsExec: false,
  seatLimit: null,
  perProject: false,
} as const;

const assignmentBase = {
  memberId: "member-2",
  assignedByIsSuperuser: true,
  position: developerPosition,
  projectId: "project-1",
  existingAssignments: [],
};

describe("checkPositionAssignment", () => {
  it("allows a position assignment when no rule is violated", () => {
    expect(checkPositionAssignment(assignmentBase)).toEqual({ allowed: true });
  });

  it("rejects a general position when its seat limit is reached", () => {
    expect(
      checkPositionAssignment({
        ...assignmentBase,
        position: { ...developerPosition, seatLimit: 1 },
        existingAssignments: [
          {
            memberId: "member-1",
            positionId: "developer",
            category: "project",
            projectId: "project-2",
          },
        ],
      })
    ).toEqual({
      allowed: false,
      code: "CONFLICT",
      reason: "SEAT_LIMIT_REACHED",
    });
  });

  it("allows a general position when seats remain", () => {
    expect(
      checkPositionAssignment({
        ...assignmentBase,
        position: { ...developerPosition, seatLimit: 2 },
        existingAssignments: [
          {
            memberId: "member-1",
            positionId: "developer",
            category: "project",
            projectId: "project-2",
          },
        ],
      })
    ).toEqual({ allowed: true });
  });

  it("rejects a per-project seat that is already taken", () => {
    expect(
      checkPositionAssignment({
        ...assignmentBase,
        position: { ...developerPosition, seatLimit: 1, perProject: true },
        existingAssignments: [
          {
            memberId: "member-1",
            positionId: "developer",
            category: "project",
            projectId: "project-1",
          },
        ],
      })
    ).toEqual({
      allowed: false,
      code: "CONFLICT",
      reason: "PROJECT_SEAT_TAKEN",
    });
  });

  it("allows a per-project seat when that position has a seat for the project", () => {
    expect(
      checkPositionAssignment({
        ...assignmentBase,
        position: { ...developerPosition, seatLimit: 1, perProject: true },
        existingAssignments: [
          {
            memberId: "member-1",
            positionId: "developer",
            category: "project",
            projectId: "project-2",
          },
        ],
      })
    ).toEqual({ allowed: true });
  });

  it("rejects a member already assigned to a different project this semester", () => {
    expect(
      checkPositionAssignment({
        ...assignmentBase,
        existingAssignments: [
          {
            memberId: "member-2",
            positionId: "other-project-position",
            category: "project",
            projectId: "project-2",
          },
        ],
      })
    ).toEqual({
      allowed: false,
      code: "ALREADY_ON_PROJECT",
      reason: "ALREADY_ON_DIFFERENT_PROJECT",
    });
  });

  it("allows multiple project positions on the same project", () => {
    expect(
      checkPositionAssignment({
        ...assignmentBase,
        existingAssignments: [
          {
            memberId: "member-2",
            positionId: "another-position",
            category: "project",
            projectId: "project-1",
          },
        ],
      })
    ).toEqual({ allowed: true });
  });

  it("rejects an exec-granting position assigned by a non-superuser", () => {
    expect(
      checkPositionAssignment({
        ...assignmentBase,
        assignedByIsSuperuser: false,
        position: {
          id: "vp",
          category: "exec",
          grantsExec: true,
          seatLimit: 2,
          perProject: false,
        },
        projectId: null,
      })
    ).toEqual({
      allowed: false,
      code: "FORBIDDEN",
      reason: "EXEC_POSITION_REQUIRES_SUPERUSER",
    });
  });

  it("allows an exec-granting position assigned by a superuser", () => {
    expect(
      checkPositionAssignment({
        ...assignmentBase,
        position: {
          id: "vp",
          category: "exec",
          grantsExec: true,
          seatLimit: 2,
          perProject: false,
        },
        projectId: null,
      })
    ).toEqual({ allowed: true });
  });
});

function accessTestApp(middleware: MiddlewareHandler<AccessEnv>, member?: AccessMember) {
  const app = new Hono<AccessEnv>().onError(handleError);
  app.use("*", async (c, next) => {
    if (member) c.set("member", member);
    await next();
  });
  app.get("/members/:memberId", middleware, (c) => c.text("allowed"));
  return app;
}

const projectMember: AccessMember = {
  id: "member-1",
  isSuperuser: false,
  positions: [{ category: "project", grantsExec: false }],
};

describe("access middleware", () => {
  it("returns 401 UNAUTHORIZED when there is no request member", async () => {
    const response = await accessTestApp(requireAccess("exec")).request("/members/member-2");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Sign in to continue." },
    });
  });

  it("returns 403 FORBIDDEN when the role is below the minimum", async () => {
    const response = await accessTestApp(requireAccess("exec"), projectMember).request(
      "/members/member-2"
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "FORBIDDEN", message: "You do not have access to this resource." },
    });
  });

  it("allows a member who meets the minimum role", async () => {
    const execMember: AccessMember = {
      ...projectMember,
      positions: [{ category: "exec", grantsExec: true }],
    };
    const response = await accessTestApp(requireAccess("exec"), execMember).request(
      "/members/member-2"
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("allowed");
  });

  it("allows a member to access their own member resource", async () => {
    const response = await accessTestApp(requireSelfOrExec(), projectMember).request(
      "/members/member-1"
    );

    expect(response.status).toBe(200);
  });

  it("allows Exec to access another member resource", async () => {
    const execMember: AccessMember = {
      ...projectMember,
      positions: [{ category: "exec", grantsExec: true }],
    };
    const response = await accessTestApp(requireSelfOrExec(), execMember).request(
      "/members/member-2"
    );

    expect(response.status).toBe(200);
  });

  it("forbids a non-Exec member from accessing another member resource", async () => {
    const response = await accessTestApp(requireSelfOrExec(), projectMember).request(
      "/members/member-2"
    );

    expect(response.status).toBe(403);
  });
});
