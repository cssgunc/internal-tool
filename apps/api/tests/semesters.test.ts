import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { semesterListSchema } from "@internal-tool/shared";
import type { SemesterList } from "@internal-tool/shared";
import { app } from "../src/app";
import * as service from "../src/services/semesters";

// Fake data, newest first, the way the service returns it. Stubbing the service
// keeps this a route test that runs without a database (CI has none).
const list: SemesterList = {
  items: [
    {
      id: "0b6f4f1e-8a7e-4c55-9d3a-2f1b6c9e0a01",
      name: "Fall 2026",
      term: "fall",
      year: 2026,
      startsOn: "2026-08-17",
      endsOn: "2026-12-11",
      isCurrent: true,
    },
    {
      id: "0b6f4f1e-8a7e-4c55-9d3a-2f1b6c9e0a02",
      name: "Spring 2026",
      term: "spring",
      year: 2026,
      startsOn: "2026-01-12",
      endsOn: "2026-05-08",
      isCurrent: false,
    },
  ],
  total: 2,
};

describe("GET /api/v1/semesters", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns the semesters as { items, total } in the service's order", async () => {
    spyOn(service, "listSemesters").mockResolvedValue(list);

    const res = await app.request("/api/v1/semesters");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(semesterListSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual(list);
  });

  it("returns an empty list when there are no semesters", async () => {
    spyOn(service, "listSemesters").mockResolvedValue({ items: [], total: 0 });

    const res = await app.request("/api/v1/semesters");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], total: 0 });
  });
});
