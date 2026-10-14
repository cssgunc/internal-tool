import { describe, expect, it } from "bun:test";
import { app } from "../src/app";

describe("GET /api/v1/health", () => {
  it("returns ok", async () => {
    const res = await app.request("/api/v1/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
