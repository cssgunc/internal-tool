import { Hono } from "hono";
import {
  createMemberRequestSchema,
  memberIdSchema,
  memberListQuerySchema,
} from "@internal-tool/shared";
import { ApiError } from "../lib/errors";
import { validate } from "../lib/validation";
import { createMember, getMember, listMembers } from "../services/members";

export const members = new Hono()
  .post("/", validate("json", createMemberRequestSchema), async (c) => {
    // TODO(auth): minimum access is exec (TDD 3.2).
    return c.json(await createMember(c.req.valid("json")), 201);
  })
  .get("/", validate("query", memberListQuerySchema), async (c) => {
    // TODO(auth): minimum access is exec (TDD 3.2).
    return c.json(await listMembers(c.req.valid("query")), 200);
  })
  .get("/:id", async (c) => {
    // TODO(auth): minimum access is exec or the member themself (TDD 3.2).
    const result = memberIdSchema.safeParse(c.req.param("id"));
    if (!result.success) {
      throw new ApiError(400, "VALIDATION", "Request validation failed.", {
        id: result.error.issues[0]?.message ?? "Expected a member UUID.",
      });
    }
    return c.json(await getMember(result.data), 200);
  });
