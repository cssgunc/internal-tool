import {
  createSemesterSchema,
  pageQuerySchema,
  updateSemesterDatesSchema,
} from "@internal-tool/shared";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse } from "../lib/errors";
import type { AppEnv } from "../lib/session";
import { validate } from "../lib/validation";
import { requireAccess } from "../middleware/access";
import { loadMember } from "../middleware/load-member";
import {
  createSemester,
  listSemesters,
  makeCurrentSemester,
  updateSemesterDates,
} from "../services/semesters";

const semesterIdSchema = z.uuid();

export const semesters = new Hono<AppEnv>()
  .get("/", validate("query", pageQuerySchema), async (c) => {
    // TODO(auth): Minimum access is member (TDD 3.2).
    return c.json(await listSemesters(c.req.valid("query")), 200);
  })
  .post(
    "/",
    loadMember,
    requireAccess("superuser"),
    validate("json", createSemesterSchema),
    async (c) => {
      const created = await createSemester(c.req.valid("json"));
      return c.json(created, 201);
    }
  )
  .patch(
    "/:id",
    loadMember,
    requireAccess("superuser"),
    validate("json", updateSemesterDatesSchema),
    async (c) => {
      const id = c.req.param("id");

      if (!semesterIdSchema.safeParse(id).success) {
        return c.json(
          errorResponse("VALIDATION", "Invalid semester ID.", {
            id: "Must be a valid UUID.",
          }),
          400
        );
      }

      const updated = await updateSemesterDates(id, c.req.valid("json"));
      return c.json(updated, 200);
    }
  )
  .post("/:id/make-current", loadMember, requireAccess("superuser"), async (c) => {
    const id = c.req.param("id");

    if (!semesterIdSchema.safeParse(id).success) {
      return c.json(
        errorResponse("VALIDATION", "Invalid semester ID.", {
          id: "Must be a valid UUID.",
        }),
        400
      );
    }

    const updated = await makeCurrentSemester(id);
    return c.json(updated, 200);
  });
