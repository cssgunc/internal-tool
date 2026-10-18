import { describe, expect, expectTypeOf, it, spyOn } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { errorResponseSchema } from "@internal-tool/shared";
import type { InferResponseType } from "hono/client";
import type { ErrorResponse } from "@internal-tool/shared";
import type { api as webApi } from "../../web/src/lib/api";
import { app, createApp } from "../src/app";
import { env } from "../src/env";
import { ApiError } from "../src/lib/errors";

const testApp = new Hono()
  .get("/conflict", () => {
    throw new ApiError(409, "ALREADY_ON_PROJECT", "Already assigned to a project.", {
      projectId: "Choose a different project.",
    });
  })
  .get("/unexpected", () => {
    throw new Error("Private database details");
  })
  .get("/without-fields", () => {
    throw new ApiError(403, "FORBIDDEN", "Access denied.");
  })
  .get("/framework-internal", () => {
    throw new HTTPException(500, { message: "Private framework details" });
  })
  .get("/framework/:status", (c) => {
    const status = Number(c.req.param("status"));
    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 409 ||
      status === 429
    ) {
      throw new HTTPException(status);
    }
    throw new Error("Unexpected test status");
  });

// Mount only on a separate app: test-only routes never appear in the production API.
const api = createApp().route("/test", testApp);

describe("API errors", () => {
  it("creates a throwable Error with diagnostic information", () => {
    const error = new ApiError(409, "ALREADY_ON_PROJECT", "Already assigned.");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error.message).toBe("Already assigned.");
    expect(error.status).toBe(409);
    expect(error.code).toBe("ALREADY_ON_PROJECT");
    expect(error.stack).toContain("Already assigned.");
  });

  it("returns the standard 404 for unknown API and root routes", async () => {
    for (const path of ["/api/v1/missing", "/missing"]) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toEqual({
        error: { code: "NOT_FOUND", message: "Resource not found." },
      });
    }
  });

  it("preserves an ApiError's status, code, message, and fields", async () => {
    const res = await api.request("/api/v1/test/conflict");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "ALREADY_ON_PROJECT",
        message: "Already assigned to a project.",
        fields: { projectId: "Choose a different project." },
      },
    });
  });

  it("omits optional fields when an ApiError has none", async () => {
    const res = await api.request("/api/v1/test/without-fields");
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      error: { code: "FORBIDDEN", message: "Access denied." },
    });
  });

  it("normalizes framework exceptions with the TDD status codes", async () => {
    for (const [status, code] of [
      [400, "VALIDATION"],
      [401, "UNAUTHORIZED"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [409, "CONFLICT"],
      [429, "RATE_LIMITED"],
    ] as const) {
      const res = await api.request(`/api/v1/test/framework/${status}`);
      expect(res.status).toBe(status);
      const body = errorResponseSchema.parse(await res.json());
      expect(body.error.code).toBe(code);
    }
  });

  it("returns a safe INTERNAL response for unexpected errors in production", async () => {
    const previousMode = env.NODE_ENV;
    const previousNodeEnv = process.env.NODE_ENV;
    const log = spyOn(console, "error").mockImplementation(() => {});
    env.NODE_ENV = "production";
    process.env.NODE_ENV = "production";
    try {
      for (const path of ["unexpected", "framework-internal"]) {
        const res = await api.request(`/api/v1/test/${path}`);
        expect(res.status).toBe(500);
        expect(res.headers.get("content-type")).toContain("application/json");
        const text = await res.text();
        expect(JSON.parse(text)).toEqual({
          error: { code: "INTERNAL", message: "An unexpected error occurred." },
        });
        expect(text).not.toContain("Private");
        expect(text).not.toContain("stack");
      }
      expect(log).toHaveBeenCalledTimes(2);
    } finally {
      env.NODE_ENV = previousMode;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      log.mockRestore();
    }
  });

  it("does not expose test routes on the production app", async () => {
    expect((await app.request("/api/v1/test/conflict")).status).toBe(404);
  });

  it("preserves success and global error types in the actual frontend client", () => {
    expectTypeOf<InferResponseType<typeof webApi.api.v1.health.$get, 200>>().toEqualTypeOf<{
      status: "ok";
    }>();
    expectTypeOf<
      InferResponseType<typeof webApi.api.v1.health.$get, 404>
    >().toEqualTypeOf<ErrorResponse>();
    expectTypeOf<
      InferResponseType<typeof webApi.api.v1.health.$get, 409>
    >().toEqualTypeOf<ErrorResponse>();
    expectTypeOf<
      InferResponseType<typeof webApi.api.v1.health.$get, 500>
    >().toEqualTypeOf<ErrorResponse>();
  });
});
