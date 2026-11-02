import { Hono } from "hono";
import { pageQuerySchema } from "@internal-tool/shared";
import { validate } from "../lib/validation";
import { listSemesters } from "../services/semesters";

export const semesters = new Hono().get("/", validate("query", pageQuerySchema), async (c) => {
  // TODO(auth): minimum access is `member` (TDD 3.2); check it here once auth exists.
  return c.json(await listSemesters(c.req.valid("query")), 200);
});
