import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { app } from "../src/app";
import { db } from "../src/db";
import { members, user } from "../src/db/schema";
import { env } from "../src/env";
import { handleError } from "../src/lib/errors";
import { requireAccess } from "../src/middleware/access";
import type { AccessEnv } from "../src/middleware/access";
import { createPasswordUser } from "../src/services/users";

describe("semester administration authorization", () => {
  function testApp(member?: AccessEnv["Variables"]["member"]) {
    const testApp = new Hono<AccessEnv>();

    testApp.onError(handleError);

    testApp.use("*", async (c, next) => {
      c.set("member", member);
      await next();
    });

    testApp.post("/semesters", requireAccess("superuser"), (c) => c.json({ success: true }));

    return testApp;
  }

  it("rejects an unauthenticated request with 401", async () => {
    const response = await testApp().request("/semesters", {
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

  it("rejects ordinary active members with 403", async () => {
    const response = await testApp({
      id: crypto.randomUUID(),
      isSuperuser: false,
      positions: [],
    }).request("/semesters", { method: "POST" });

    expect(response.status).toBe(403);
  });

  it("allows active superusers", async () => {
    const response = await testApp({
      id: crypto.randomUUID(),
      isSuperuser: true,
      positions: [],
    }).request("/semesters", { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});

// These tests exercise the real session middleware, member lookup,
// and semester routes against the database.
describe.skipIf(!env.DATABASE_URL)("semester administration HTTP authorization", () => {
  const password = "correct horse battery staple";
  const ordinaryEmail = `semester-member-${crypto.randomUUID()}@example.com`;
  const superuserEmail = `semester-superuser-${crypto.randomUUID()}@example.com`;
  const alumniEmail = `semester-alumni-${crypto.randomUUID()}@example.com`;

  let ordinaryCookie = "";
  let superuserCookie = "";
  let alumniCookie = "";
  // Sign-in is rate limited per client IP, and a test request has none, so each
  // sign-in gets its own address the way auth.test.ts does.
  let ipCounter = 0;
  const initialClientIpSource = env.CLIENT_IP_SOURCE;

  async function createTestMember(
    email: string,
    isSuperuser: boolean,
    status: "active" | "alumni" = "active"
  ) {
    const createdUser = await createPasswordUser({
      email,
      name: "Semester Test",
      password,
    });

    await db.insert(members).values({
      userId: createdUser.id,
      firstName: "Semester",
      lastName: "Test",
      email,
      isSuperuser,
      status,
    });

    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: env.BETTER_AUTH_URL,
        "X-Real-IP": `203.0.113.${++ipCounter}`,
      },
      body: JSON.stringify({ email, password }),
    });

    expect(signIn.status).toBe(200);

    const cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");

    expect(cookie).toContain("better-auth.session_token=");
    return cookie;
  }

  beforeAll(async () => {
    env.CLIENT_IP_SOURCE = "railway";
    ordinaryCookie = await createTestMember(ordinaryEmail, false);
    superuserCookie = await createTestMember(superuserEmail, true);
    alumniCookie = await createTestMember(alumniEmail, true, "alumni");
  });

  afterAll(async () => {
    env.CLIENT_IP_SOURCE = initialClientIpSource;
    for (const email of [ordinaryEmail, superuserEmail, alumniEmail]) {
      await db.delete(members).where(eq(members.email, email));
      await db.delete(user).where(eq(user.email, email));
    }
  });

  it("returns 401 when signed out", async () => {
    const response = await app.request("/api/v1/semesters", {
      method: "POST",
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 when a signed-in ordinary member creates a semester", async () => {
    const response = await app.request("/api/v1/semesters", {
      method: "POST",
      headers: {
        cookie: ordinaryCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        term: "fall",
        year: 2099,
        startsOn: "2099-08-20",
        endsOn: "2099-12-10",
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "You do not have access to this resource.",
      },
    });
  });

  it("does not authorize an alumni superuser", async () => {
    const response = await app.request("/api/v1/semesters", {
      method: "POST",
      headers: {
        cookie: alumniCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        term: "fall",
        year: 2099,
        startsOn: "2099-08-20",
        endsOn: "2099-12-10",
      }),
    });

    expect([401, 403]).toContain(response.status);
  });

  it("returns 400 when an authorized superuser supplies an invalid semester UUID", async () => {
    const response = await app.request("/api/v1/semesters/not-a-uuid", {
      method: "PATCH",
      headers: {
        cookie: superuserCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startsOn: "2099-08-20",
        endsOn: "2099-12-10",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "Invalid semester ID.",
        fields: {
          id: "Must be a valid UUID.",
        },
      },
    });
  });
});
