import {
  assignPositionRequestSchema,
  deleteMemberPositionResponseSchema,
  memberPositionSchema,
} from "@internal-tool/shared";
import { Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../lib/session";
import { validate } from "../lib/validation";
import type { ProjectsService } from "../services/projects";

export type AssignmentCaller = { isSuperuser: boolean };
type AssignmentCallerProvider = () => AssignmentCaller;

const uuidSchema = z.uuid();

function routeId(value: string): string {
  if (!uuidSchema.safeParse(value).success) {
    throw new ApiError(400, "VALIDATION", "Invalid member or assignment id.", {
      id: "Expected a UUID.",
    });
  }
  return value;
}

export function createMemberPositionRoutes(
  service: ProjectsService,
  caller: AssignmentCallerProvider = () => ({ isSuperuser: false })
) {
  return new Hono<AppEnv>()
    .post("/members/:id/positions", validate("json", assignPositionRequestSchema), async (c) => {
      // TODO(auth): require Exec; assigning an Exec-granting position requires Superuser.
      const result = await service.assignPosition(
        routeId(c.req.param("id")),
        c.req.valid("json"),
        caller()
      );
      return c.json(memberPositionSchema.parse(result), 201);
    })
    .delete("/member-positions/:id", async (c) => {
      // TODO(auth): require Exec; removing an Exec-granting position requires Superuser.
      const result = await service.removePositionAssignment(routeId(c.req.param("id")), caller());
      return c.json(deleteMemberPositionResponseSchema.parse(result), 200);
    });
}
