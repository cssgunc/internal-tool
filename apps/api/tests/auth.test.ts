import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { meResponseSchema } from "@internal-tool/shared";
import type { ErrorResponse } from "@internal-tool/shared";
import { app } from "../src/app";
import { user } from "../src/db/schema";
import { env } from "../src/env";
import { createPasswordUser } from "../src/services/users";

// These run against a real database: CI starts Postgres and runs the migrations
// (see .github/workflows/ci.yml), and the devcontainer has one too. Each run uses its
// own fake email and deletes that user afterwards (sessions and accounts cascade).
const email = `auth-test-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";
const name = "Auth Test";

// Browsers send the web app's origin, and Better Auth rejects untrusted ones.
const headers = { "content-type": "application/json", origin: env.BETTER_AUTH_URL };

function signIn(body: { email: string; password: string }) {
  return app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// Turns a response's Set-Cookie headers into a Cookie header for the next request.
function cookieFrom(res: Response) {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

describe("auth", () => {
  beforeAll(async () => {
    if (!env.DATABASE_URL) {
      throw new Error(
        "The auth tests need a database: set DATABASE_URL (CI and the devcontainer do)."
      );
    }
    await createPasswordUser({ email, name, password });
  });

  afterAll(async () => {
    const { db } = await import("../src/db");
    await db.delete(user).where(eq(user.email, email));
  });

  it("signs in with the right password and sets a session cookie", async () => {
    const res = await signIn({ email, password });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe(email);
    expect(cookieFrom(res)).toContain("better-auth.session_token=");
  });

  it("rejects a wrong password without a session", async () => {
    const res = await signIn({ email, password: "not the password" });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(cookieFrom(res)).not.toContain("better-auth.session_token=");
  });

  it("rejects a sign-in sent from another website", async () => {
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { ...headers, origin: "https://evil.example" },
      body: JSON.stringify({ email, password }),
    });

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("INVALID_ORIGIN");
    expect(cookieFrom(res)).not.toContain("better-auth.session_token=");
  });

  it("rejects public sign-up and creates no user", async () => {
    const newEmail = `signup-test-${crypto.randomUUID()}@example.com`;

    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: newEmail, password, name: "Nobody" }),
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
    expect((await signIn({ email: newEmail, password })).status).toBe(401);
  });

  it("GET /me returns the signed-in user", async () => {
    const cookie = cookieFrom(await signIn({ email, password }));

    const res = await app.request("/api/v1/me", { headers: { cookie } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(meResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({ id: expect.any(String), email, name });
  });

  it("GET /me returns 401 UNAUTHORIZED when signed out", async () => {
    const res = await app.request("/api/v1/me");

    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("UNAUTHORIZED");
  });

  it("GET /me returns 401 for a session cookie that doesn't match a session", async () => {
    const res = await app.request("/api/v1/me", {
      headers: { cookie: "better-auth.session_token=forged.token" },
    });

    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("UNAUTHORIZED");
  });

  it("GET /me returns 401 after signing out", async () => {
    const cookie = cookieFrom(await signIn({ email, password }));
    const signOut = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { ...headers, cookie },
    });
    expect(signOut.status).toBe(200);

    const res = await app.request("/api/v1/me", { headers: { cookie } });

    expect(res.status).toBe(401);
  });
});

describe("auth:create-user script", () => {
  it("refuses to run when NODE_ENV=production", () => {
    const result = Bun.spawnSync(
      ["bun", "src/scripts/create-user.ts", "--email", "x@example.com", "--password", "longenough"],
      {
        cwd: `${import.meta.dir}/..`,
        env: {
          ...process.env,
          NODE_ENV: "production",
          BETTER_AUTH_SECRET: "x".repeat(32),
          BETTER_AUTH_URL: "https://admin.example.org",
        },
      }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Refusing to run");
  });
});
