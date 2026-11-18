import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Hono } from "hono";
import { errorResponseSchema } from "@internal-tool/shared";
import { env } from "../src/env";
import { AUTH_RATE_LIMITS, createAuthRoutes } from "../src/routes/auth";

const initialClientIpSource = env.CLIENT_IP_SOURCE;
afterEach(() => {
  mock.restore();
  env.CLIENT_IP_SOURCE = initialClientIpSource;
});

function setup() {
  let handled = 0;
  const app = new Hono().route(
    "/api/auth",
    createAuthRoutes(async () => {
      handled++;
      return Response.json({ ok: true });
    })
  );
  return { app, handled: () => handled };
}

function request(app: Hono, path: string, ip = "203.0.113.1") {
  return app.request(`/api/auth${path}`, {
    method: "POST",
    headers: { "X-Real-IP": ip },
  });
}

describe("auth rate limits", () => {
  it("limits each protected auth endpoint per IP", async () => {
    env.CLIENT_IP_SOURCE = "railway";
    const endpoints = [
      ["/sign-in/email", AUTH_RATE_LIMITS.signIn],
      ["/request-password-reset", AUTH_RATE_LIMITS.requestPasswordReset],
      ["/reset-password", AUTH_RATE_LIMITS.resetPassword],
    ] as const;

    for (const [path, limit] of endpoints) {
      const { app, handled } = setup();
      for (let count = 0; count < limit.max; count++) {
        expect((await request(app, path)).status).toBe(200);
      }

      const blocked = await request(app, path);
      expect(blocked.status).toBe(429);
      expect(errorResponseSchema.parse(await blocked.json()).error.code).toBe("RATE_LIMITED");
      expect(handled()).toBe(limit.max);
    }
  });

  it("resets the counter when its window expires", async () => {
    env.CLIENT_IP_SOURCE = "railway";
    const limit = AUTH_RATE_LIMITS.signIn;
    const clock = spyOn(performance, "now").mockReturnValue(5000);
    const { app } = setup();

    for (let count = 0; count < limit.max; count++) {
      expect((await request(app, "/sign-in/email")).status).toBe(200);
    }
    expect((await request(app, "/sign-in/email")).status).toBe(429);

    clock.mockReturnValue(5000 + limit.windowMs);
    expect((await request(app, "/sign-in/email")).status).toBe(200);
  });

  it("counts different IPs separately", async () => {
    env.CLIENT_IP_SOURCE = "railway";
    const { app } = setup();
    const path = "/request-password-reset";
    const limit = AUTH_RATE_LIMITS.requestPasswordReset;

    for (let count = 0; count < limit.max; count++) {
      expect((await request(app, path, "203.0.113.1")).status).toBe(200);
    }
    expect((await request(app, path, "203.0.113.1")).status).toBe(429);
    expect((await request(app, path, "203.0.113.2")).status).toBe(200);
  });
});
