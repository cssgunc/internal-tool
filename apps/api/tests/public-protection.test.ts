import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponseSchema, honeypot } from "@internal-tool/shared";
import { app, createApp } from "../src/app";
import { env } from "../src/env";
import { clientIp } from "../src/lib/client-ip";
import { rateLimit } from "../src/lib/rate-limit";
import { verifyTurnstile } from "../src/lib/turnstile";
import { validate } from "../src/lib/validation";

const initialSource = env.CLIENT_IP_SOURCE;
afterEach(() => {
  mock.restore();
  env.CLIENT_IP_SOURCE = initialSource;
});

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("Turnstile", () => {
  function route() {
    return createApp().route(
      "/test",
      new Hono().post(
        "/",
        verifyTurnstile,
        validate("json", z.object({ turnstileToken: z.string(), website: honeypot })),
        (c) => c.json({ token: c.req.valid("json").turnstileToken })
      )
    );
  }

  it("posts to Siteverify, then leaves the cached JSON available for schema validation", async () => {
    const timeout = spyOn(AbortSignal, "timeout");
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true })
    );
    const res = await route().request("/api/v1/test", json({ turnstileToken: "valid-token" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "valid-token" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect((init?.body as URLSearchParams).get("secret")).toBe(env.TURNSTILE_SECRET_KEY);
    expect((init?.body as URLSearchParams).get("response")).toBe("valid-token");
    expect((init?.body as URLSearchParams).has("remoteip")).toBe(false);
  });

  it("rejects missing, nonstring, empty, oversized tokens and malformed JSON without fetching", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Must not fetch"));
    const api = route();
    for (const body of [
      {},
      null,
      [],
      { turnstileToken: null },
      { turnstileToken: 1 },
      { turnstileToken: [] },
      { turnstileToken: "" },
      { turnstileToken: " " },
      { turnstileToken: "a".repeat(2049) },
    ]) {
      const res = await api.request("/api/v1/test", json(body));
      expect(res.status).toBe(400);
      expect(errorResponseSchema.parse(await res.json()).error).toMatchObject({
        code: "VALIDATION",
        fields: { turnstileToken: expect.any(String) },
      });
    }
    expect((await api.request("/api/v1/test", { method: "POST", body: "{" })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the maximum token length", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: true }));
    expect(
      (await route().request("/api/v1/test", json({ turnstileToken: "a".repeat(2048) }))).status
    ).toBe(200);
  });

  it("fails closed for invalid tokens, provider errors, malformed responses, network errors and timeout", async () => {
    const responses = [
      Response.json({ success: false, "error-codes": ["invalid-input-response"] }),
      Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] }),
      Response.json({ success: true }, { status: 503 }),
      new Response("not json"),
      Response.json(null),
      Response.json({}),
      Response.json({ success: "true" }),
      Response.json({ success: 1 }),
      new Error("Network failure containing private details"),
      new DOMException("Timed out", "TimeoutError"),
    ];
    const fetchMock = spyOn(globalThis, "fetch");
    for (const response of responses) {
      if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
      else fetchMock.mockResolvedValueOnce(response);
      const res = await route().request("/api/v1/test", json({ turnstileToken: "token" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: {
          code: "VALIDATION",
          message: "Verification failed.",
          fields: { turnstileToken: "Complete the verification and try again." },
        },
      });
    }
  });
});

describe("client IP trust boundary", () => {
  const api = createApp().get("/test/ip", (c) => c.json({ ip: clientIp(c) }));
  const headers = {
    "X-Real-IP": "203.0.113.10",
    "X-Forwarded-For": "203.0.113.20",
    Forwarded: "for=203.0.113.30",
    "CF-Connecting-IP": "203.0.113.40",
  };

  it("uses the socket for direct/private access, ignoring every spoofed header", async () => {
    env.CLIENT_IP_SOURCE = "socket";
    for (const address of ["127.0.0.1", "10.0.0.12", "fd00::1"]) {
      const res = await api.request(
        "/api/v1/test/ip",
        { headers },
        {
          requestIP: () => ({ address, family: "IPv4", port: 1234 }),
        }
      );
      expect(await res.json()).toEqual({ ip: address });
    }
    expect((await api.request("/api/v1/test/ip", { headers })).status).toBe(400);
    expect(
      (
        await api.request(
          "/api/v1/test/ip",
          { headers },
          {
            requestIP: () => ({ address: "not-an-ip", family: "IPv4", port: 1234 }),
          }
        )
      ).status
    ).toBe(400);
    expect(
      (await api.request("/api/v1/test/ip", { headers }, { requestIP: () => null })).status
    ).toBe(400);
  });

  it("trusts only X-Real-IP when explicitly configured for Railway", async () => {
    env.CLIENT_IP_SOURCE = "railway";
    expect(await (await api.request("/api/v1/test/ip", { headers })).json()).toEqual({
      ip: headers["X-Real-IP"],
    });
    const { "X-Real-IP": _ignored, ...spoofed } = headers;
    expect((await api.request("/api/v1/test/ip", { headers: spoofed })).status).toBe(400);
  });

  it("rejects absent, malformed, multiple, port-suffixed and zone-qualified proxy IPs", async () => {
    env.CLIENT_IP_SOURCE = "railway";
    for (const address of [
      "",
      "unknown",
      "999.1.2.3",
      "127.1",
      "1.2.3.4:80",
      "[2001:db8::1]",
      "2001:db8::1, 203.0.113.1",
      "203.0.113.1, 203.0.113.2",
      "fe80::1%eth0",
    ]) {
      const res = await api.request("/api/v1/test/ip", {
        headers: { ...headers, "X-Real-IP": address },
      });
      expect(res.status).toBe(400);
      expect(errorResponseSchema.parse(await res.json()).error.code).toBe("VALIDATION");
    }
  });

  it("canonicalizes IPv6 and IPv4-mapped IPv6 to prevent alternate-spelling bypasses", async () => {
    env.CLIENT_IP_SOURCE = "railway";
    for (const [address, ip] of [
      ["2001:0DB8:0:0:0:0:0:1", "2001:db8::1"],
      ["::ffff:203.0.113.10", "203.0.113.10"],
      ["::ffff:cb00:710a", "203.0.113.10"],
    ] as const) {
      expect(
        await (await api.request("/api/v1/test/ip", { headers: { "X-Real-IP": address } })).json()
      ).toEqual({ ip });
    }
  });

  it("documents why private callers must be trusted in Railway mode: headers cannot authenticate ingress", async () => {
    env.CLIENT_IP_SOURCE = "railway";
    const res = await api.request(
      "/api/v1/test/ip",
      { headers },
      {
        requestIP: () => ({ address: "10.0.0.12", family: "IPv4", port: 1234 }),
      }
    );
    expect(await res.json()).toEqual({ ip: headers["X-Real-IP"] });
  });
});

describe("rate limit", () => {
  function route(windowMs = 2500, max = 2) {
    env.CLIENT_IP_SOURCE = "railway";
    return createApp().get("/test/limited", rateLimit({ windowMs, max }), (c) =>
      c.json({ ok: true })
    );
  }
  function request(api: ReturnType<typeof route>, ip = "203.0.113.1", forwarded = "1.1.1.1") {
    return api.request("/api/v1/test/limited", {
      headers: { "X-Real-IP": ip, "X-Forwarded-For": forwarded },
    });
  }

  it("validates configuration synchronously", () => {
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => rateLimit({ windowMs: invalid, max: 1 })).toThrow(RangeError);
      expect(() => rateLimit({ windowMs: 1, max: invalid })).toThrow(RangeError);
    }
  });

  it("allows N requests, blocks N+1, rounds Retry-After up and resets exactly at expiry", async () => {
    const clock = spyOn(performance, "now").mockReturnValue(1000);
    const api = route();
    expect((await request(api)).status).toBe(200);
    expect((await request(api)).status).toBe(200);
    const blocked = await request(api);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("3");
    expect(await blocked.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests." },
    });
    clock.mockReturnValue(2501);
    expect((await request(api)).headers.get("Retry-After")).toBe("1");
    clock.mockReturnValue(3499);
    expect((await request(api)).status).toBe(429);
    clock.mockReturnValue(3500);
    const reset = await request(api);
    expect(reset.status).toBe(200);
    expect(reset.headers.get("Retry-After")).toBeNull();
    expect((await request(api)).status).toBe(200);
    expect((await request(api)).status).toBe(429);
  });

  it("isolates IPs and middleware instances and ignores spoofed forwarded headers", async () => {
    const first = route();
    const second = route();
    await request(first);
    await request(first);
    expect((await request(first, "203.0.113.1", "8.8.8.8")).status).toBe(429);
    expect((await request(first, "203.0.113.2")).status).toBe(200);
    expect((await request(second)).status).toBe(200);
    expect((await request(first, "::ffff:203.0.113.1")).status).toBe(429);
  });

  it("does not let concurrent requests exceed the limit", async () => {
    const api = route(10000, 3);
    const responses = await Promise.all(Array.from({ length: 10 }, () => request(api)));
    expect(responses.filter((res) => res.status === 200)).toHaveLength(3);
    expect(responses.filter((res) => res.status === 429)).toHaveLength(7);
  });

  it("keeps staggered IP windows independent while pruning older entries", async () => {
    const clock = spyOn(performance, "now").mockReturnValue(0);
    const api = route(1000, 1);
    await request(api);
    clock.mockReturnValue(500);
    await request(api, "203.0.113.2");
    clock.mockReturnValue(1000);
    expect((await request(api)).status).toBe(200);
    expect((await request(api, "203.0.113.2")).status).toBe(429);
    clock.mockReturnValue(1500);
    expect((await request(api, "203.0.113.2")).status).toBe(200);
    expect((await request(api)).status).toBe(429);
  });

  it("charges failed validation and stops before Cloudflare when the limit is reached", async () => {
    env.CLIENT_IP_SOURCE = "railway";
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true })
    );
    const api = createApp().post(
      "/test/combined",
      rateLimit({ windowMs: 10000, max: 2 }),
      validate("json", z.object({ website: honeypot })),
      verifyTurnstile,
      (c) => c.json({ ok: true })
    );
    const send = (body: unknown) =>
      api.request("/api/v1/test/combined", {
        ...json(body),
        headers: { "Content-Type": "application/json", "X-Real-IP": "203.0.113.1" },
      });
    expect((await send({ website: "spam", turnstileToken: "token" })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await send({ website: "", turnstileToken: "token" })).status).toBe(200);
    expect((await send({ website: "", turnstileToken: "token" })).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds memory without evicting active counters, then reclaims expired entries", async () => {
    const clock = spyOn(performance, "now").mockReturnValue(0);
    const api = route(10000, 1);
    for (let i = 0; i < 10000; i++) {
      const res = await request(api, `10.0.${i >> 8}.${i & 255}`);
      expect(res.status).toBe(200);
    }
    const full = await request(api);
    expect(full.status).toBe(429);
    expect(full.headers.get("Retry-After")).toBe("10");
    expect((await request(api, "10.0.0.0")).status).toBe(429);
    clock.mockReturnValue(10000);
    expect((await request(api)).status).toBe(200);
    expect((await request(api, "10.0.0.0")).status).toBe(200);
  });
});

describe("honeypot", () => {
  it("composes with JSON validation and returns the standard field error", async () => {
    const api = createApp().post(
      "/test/honeypot",
      validate("json", z.object({ website: honeypot })),
      (c) => c.json(c.req.valid("json"))
    );
    for (const body of [{}, { website: "" }]) {
      expect((await api.request("/api/v1/test/honeypot", json(body))).status).toBe(200);
    }
    for (const website of ["spam", " ", null, 0, false, [], {}]) {
      const res = await api.request("/api/v1/test/honeypot", json({ website }));
      expect(res.status).toBe(400);
      expect(errorResponseSchema.parse(await res.json()).error).toMatchObject({
        code: "VALIDATION",
        fields: { website: expect.any(String) },
      });
    }
  });

  it("does not expose any protection test route on the production app", async () => {
    for (const path of ["/test", "/test/ip", "/test/limited", "/test/honeypot", "/test/combined"]) {
      expect((await app.request(`/api/v1${path}`)).status).toBe(404);
      expect((await app.request(`/api/v1${path}`, { method: "POST" })).status).toBe(404);
    }
    expect((await app.request("/api/v1/health")).status).toBe(200);
  });
});
