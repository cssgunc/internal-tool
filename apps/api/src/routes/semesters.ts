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
import { requireSemesterAdmin } from "../middleware/semester-admin";
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
  .post("/", requireSemesterAdmin, validate("json", createSemesterSchema), async (c) => {
    const created = await createSemester(c.req.valid("json"));
    return c.json(created, 201);
  })
  .patch("/:id", requireSemesterAdmin, validate("json", updateSemesterDatesSchema), async (c) => {
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
  })
  .post("/:id/make-current", requireSemesterAdmin, async (c) => {
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
