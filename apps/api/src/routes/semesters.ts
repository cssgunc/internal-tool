import { Hono } from "hono";
import { listSemesters } from "../services/semesters";

export const semesters = new Hono().get("/", async (c) => {
  // TODO(auth): check the caller's access here once auth exists.
  return c.json(await listSemesters(), 200);
});
