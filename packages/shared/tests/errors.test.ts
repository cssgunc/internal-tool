import { describe, expect, it } from "bun:test";
import { ERROR_CODES, errorResponseSchema } from "../src";

describe("errorResponseSchema", () => {
  it("accepts every shared code with an optional field map", () => {
    for (const code of ERROR_CODES) {
      expect(
        errorResponseSchema.safeParse({ error: { code, message: "Request failed." } }).success
      ).toBe(true);
    }
    expect(
      errorResponseSchema.safeParse({
        error: { code: "VALIDATION", message: "Invalid input.", fields: { email: "Required" } },
      }).success
    ).toBe(true);
  });

  it("rejects missing messages, unknown codes, and invalid field messages", () => {
    for (const error of [
      { code: "NOT_FOUND" },
      { code: "UNKNOWN", message: "Failed" },
      { code: "VALIDATION", message: "Failed", fields: { email: ["Required"] } },
    ]) {
      expect(errorResponseSchema.safeParse({ error }).success).toBe(false);
    }
  });
});
