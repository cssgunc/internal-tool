import { describe, expect, it } from "bun:test";
import { envSchema } from "../src/env";

const testSecrets = [
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
] as const;

describe("public protection environment", () => {
  it("defaults development and tests to Cloudflare's public test secret", () => {
    for (const NODE_ENV of [undefined, "development", "test"]) {
      expect(envSchema.parse({ NODE_ENV }).TURNSTILE_SECRET_KEY).toBe(testSecrets[0]);
    }
  });

  it("accepts each official testing secret outside production", () => {
    for (const TURNSTILE_SECRET_KEY of testSecrets) {
      expect(envSchema.parse({ NODE_ENV: "test", TURNSTILE_SECRET_KEY }).TURNSTILE_SECRET_KEY).toBe(
        TURNSTILE_SECRET_KEY
      );
    }
  });

  it("rejects missing, blank, and all official dummy keys in production", () => {
    for (const TURNSTILE_SECRET_KEY of [
      undefined,
      "",
      " ",
      ...testSecrets,
      "1x00000000000000000000AA",
      "2x00000000000000000000AB",
      "1x00000000000000000000BB",
      "2x00000000000000000000BB",
      "3x00000000000000000000FF",
      ` ${testSecrets[0]} `,
    ]) {
      const result = envSchema.safeParse({ NODE_ENV: "production", TURNSTILE_SECRET_KEY });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]!.path).toEqual(["TURNSTILE_SECRET_KEY"]);
    }
  });

  it("requires a nonblank explicit production secret and validates proxy mode", () => {
    expect(
      envSchema.parse({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "fake-real-secret" })
        .TURNSTILE_SECRET_KEY
    ).toBe("fake-real-secret");
    expect(envSchema.safeParse({ TURNSTILE_SECRET_KEY: " " }).success).toBe(false);
    expect(envSchema.parse({}).CLIENT_IP_SOURCE).toBe("socket");
    expect(envSchema.parse({ CLIENT_IP_SOURCE: "railway" }).CLIENT_IP_SOURCE).toBe("railway");
    expect(envSchema.safeParse({ CLIENT_IP_SOURCE: "true" }).success).toBe(false);
  });
});
