import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { handleError } from "../src/lib/errors";
import type { AppEnv } from "../src/lib/session";
import { canAdministerSemesters, requireSemesterAdmin } from "../src/middleware/semester-admin";

describe("semester administration authorization", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const app = new Hono<AppEnv>();

    app.onError(handleError);

    app.use("*", async (c, next) => {
      c.set("user", null);
      c.set("session", null);
      await next();
    });

    app.post("/semesters", requireSemesterAdmin, (c) => c.json({ success: true }));

    const response = await app.request("/semesters", {
      method: "POST",
    });

    expect(response.status).toBe(401);

    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in to continue.",
      },
    });
  });

  it("rejects users without a member record", () => {
    expect(canAdministerSemesters(null)).toBe(false);
  });

  it("rejects ordinary active members", () => {
    expect(
      canAdministerSemesters({
        isSuperuser: false,
        status: "active",
      })
    ).toBe(false);
  });

  it("rejects alumni even if they are superusers", () => {
    expect(
      canAdministerSemesters({
        isSuperuser: true,
        status: "alumni",
      })
    ).toBe(false);
  });

  it("allows active superusers", () => {
    expect(
      canAdministerSemesters({
        isSuperuser: true,
        status: "active",
      })
    ).toBe(true);
  });
});
