import {
  createProjectRequestSchema,
  deleteProjectResponseSchema,
  patchProjectRequestSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectSchema,
} from "@internal-tool/shared";
import { Hono } from "hono";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../lib/session";
import { validate } from "../lib/validation";
import type { ProjectsService } from "../services/projects";
import { z } from "zod";

const uuidSchema = z.uuid();

function routeId(value: string): string {
  if (!uuidSchema.safeParse(value).success) {
    throw new ApiError(400, "VALIDATION", "Invalid project id.", { id: "Expected a UUID." });
  }
  return value;
}

export function createProjectRoutes(service: ProjectsService) {
  return new Hono<AppEnv>()
    .get("/", validate("query", projectListQuerySchema), async (c) => {
      // TODO(auth): require at least Project Member; limit non-Exec results to the caller's project.
      const { semesterId } = c.req.valid("query");
      return c.json(projectListResponseSchema.parse(await service.listProjects(semesterId)), 200);
    })
    .post("/", validate("json", createProjectRequestSchema), async (c) => {
      // TODO(auth): require Exec.
      return c.json(projectSchema.parse(await service.createProject(c.req.valid("json"))), 201);
    })
    .patch("/:id", validate("json", patchProjectRequestSchema), async (c) => {
      // TODO(auth): require Exec.
      const id = routeId(c.req.param("id"));
      return c.json(projectSchema.parse(await service.patchProject(id, c.req.valid("json"))), 200);
    })
    .delete("/:id", async (c) => {
      // TODO(auth): require Exec.
      return c.json(
        deleteProjectResponseSchema.parse(await service.deleteProject(routeId(c.req.param("id")))),
        200
      );
    });
}
