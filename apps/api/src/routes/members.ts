import { Hono } from "hono";
import {
  createMemberRequestSchema,
  memberIdSchema,
  memberListQuerySchema,
  updateMemberRequestSchema,
} from "@internal-tool/shared";
import { ApiError } from "../lib/errors";
import { validate } from "../lib/validation";
import { createMember, getMember, listMembers, updateMember } from "../services/members";

export const members = new Hono()
  .patch("/:id", validate("json", updateMemberRequestSchema), async (c) => {
    // TODO(auth): exec or the member themself (TDD 2.2/3.2). Self-service must use
    // updateMemberProfileRequestSchema / SELF_EDITABLE_MEMBER_FIELDS when auth is connected.
    const result = memberIdSchema.safeParse(c.req.param("id"));
    if (!result.success) {
      throw new ApiError(400, "VALIDATION", "Request validation failed.", {
        id: result.error.issues[0]?.message ?? "Expected a member UUID.",
      });
    }
    return c.json(await updateMember(result.data, c.req.valid("json")), 200);
  })
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
