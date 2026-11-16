import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { hasSessionCookie, isPublicRoute, proxy } from "../src/proxy";

function createRequest(pathAndQuery: string, cookies: Record<string, string> = {}): NextRequest {
  const url = `http://localhost:3000${pathAndQuery}`;
  const req = new NextRequest(url);
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("proxy route protection", () => {
  describe("isPublicRoute helper", () => {
    it("identifies public routes and subpaths", () => {
      expect(isPublicRoute("/sign-in")).toBe(true);
      expect(isPublicRoute("/sign-in/subpath")).toBe(true);
      expect(isPublicRoute("/set-password")).toBe(true);
      expect(isPublicRoute("/set-password/reset")).toBe(true);
      expect(isPublicRoute("/checkin")).toBe(true);
      expect(isPublicRoute("/checkin/meeting-token-123")).toBe(true);
    });

    it("identifies protected routes as non-public", () => {
      expect(isPublicRoute("/")).toBe(false);
      expect(isPublicRoute("/semesters")).toBe(false);
      expect(isPublicRoute("/exec/interest-meetings")).toBe(false);
      expect(isPublicRoute("/checkin-other")).toBe(false);
      expect(isPublicRoute("/sign-in-portal")).toBe(false);
    });
  });

  describe("hasSessionCookie helper", () => {
    it("returns true for standard Better Auth session token", () => {
      const req = createRequest("/", { "better-auth.session_token": "valid_token" });
      expect(hasSessionCookie(req)).toBe(true);
    });

    it("returns true for secure Better Auth session token", () => {
      const req = createRequest("/", { "__Secure-better-auth.session_token": "secure_token" });
      expect(hasSessionCookie(req)).toBe(true);
    });

    it("returns false when cookies are missing or empty", () => {
      const emptyReq = createRequest("/");
      expect(hasSessionCookie(emptyReq)).toBe(false);

      const blankReq = createRequest("/", { "better-auth.session_token": "   " });
      expect(hasSessionCookie(blankReq)).toBe(false);

      const unrelatedReq = createRequest("/", { other_cookie: "some_value" });
      expect(hasSessionCookie(unrelatedReq)).toBe(false);
    });
  });

  describe("unauthenticated access to protected routes", () => {
    it.each([
      ["root path", "/", "http://localhost:3000/sign-in?next=%2F"],
      ["semesters list", "/semesters", "http://localhost:3000/sign-in?next=%2Fsemesters"],
      [
        "exec interest meetings",
        "/exec/interest-meetings",
        "http://localhost:3000/sign-in?next=%2Fexec%2Finterest-meetings",
      ],
    ])("redirects %s to /sign-in?next=...", (_, path, expectedRedirect) => {
      const req = createRequest(path);
      const res = proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(expectedRedirect);
    });

    it("preserves query parameters safely in the redirect URL", () => {
      const req = createRequest("/semesters?year=2026&sort=asc");
      const res = proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/sign-in?next=%2Fsemesters%3Fyear%3D2026%26sort%3Dasc"
      );
    });

    it("preserves complex query parameters on exec routes", () => {
      const req = createRequest("/exec/interest-meetings?tab=active&view=grid");
      const res = proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/sign-in?next=%2Fexec%2Finterest-meetings%3Ftab%3Dactive%26view%3Dgrid"
      );
    });
  });

  describe("authenticated access to protected routes", () => {
    it.each(["/", "/semesters", "/exec/interest-meetings"])(
      "allows access to %s when session cookie is present",
      (path) => {
        const req = createRequest(path, { "better-auth.session_token": "active_token" });
        const res = proxy(req);

        // NextResponse.next() does not have a 307 redirect status or location header
        expect(res.status).not.toBe(307);
        expect(res.headers.get("location")).toBeNull();
      }
    );

    it("allows access with __Secure-better-auth.session_token", () => {
      const req = createRequest("/semesters", {
        "__Secure-better-auth.session_token": "active_secure_token",
      });
      const res = proxy(req);

      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("public route exemptions (no authentication required)", () => {
    it.each([
      ["/sign-in"],
      ["/sign-in?next=%2Fsemesters"],
      ["/set-password"],
      ["/set-password?token=secret-token-123"],
      ["/checkin"],
      ["/checkin/meeting-token-abc"],
      ["/checkin/meeting-token-abc?source=qr"],
    ])("allows public access to %s without cookies", (path) => {
      const req = createRequest(path);
      const res = proxy(req);

      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
    });

    it("does not redirect when visiting /sign-in with an expired/stale cookie (prevents redirect loop)", () => {
      const req = createRequest("/sign-in", { "better-auth.session_token": "expired_token" });
      const res = proxy(req);

      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("excluded routes (API, Next internals, static files)", () => {
    it.each([
      ["/api/v1/health"],
      ["/api/auth/sign-in/email"],
      ["/_next/static/chunks/main.js"],
      ["/_next/image?url=%2Flogo.png&w=64&q=75"],
      ["/favicon.ico"],
      ["/robots.txt"],
      ["/images/logo.svg"],
    ])("bypasses authentication for %s", (path) => {
      const req = createRequest(path);
      const res = proxy(req);

      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
    });
  });
});
