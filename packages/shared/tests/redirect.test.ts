import { describe, expect, it } from "bun:test";
import { getSafeRedirectPath, isSafeRedirectPath } from "../src/redirect";

describe("redirect helper", () => {
  describe("isSafeRedirectPath", () => {
    it("accepts valid relative application paths", () => {
      expect(isSafeRedirectPath("/")).toBe(true);
      expect(isSafeRedirectPath("/semesters")).toBe(true);
      expect(isSafeRedirectPath("/exec/interest-meetings")).toBe(true);
      expect(isSafeRedirectPath("/path/to/resource?query=1&flag=true#section")).toBe(true);
      expect(isSafeRedirectPath("/path?returnTo=https://google.com")).toBe(true);
    });

    it("rejects external URLs", () => {
      expect(isSafeRedirectPath("https://evil.com")).toBe(false);
      expect(isSafeRedirectPath("http://evil.com")).toBe(false);
      expect(isSafeRedirectPath("ftp://evil.com")).toBe(false);
      expect(isSafeRedirectPath("https://internal-tool.com/foo")).toBe(false);
    });

    it("rejects protocol-relative URLs", () => {
      expect(isSafeRedirectPath("//evil.com")).toBe(false);
      expect(isSafeRedirectPath("//evil.com/path")).toBe(false);
      expect(isSafeRedirectPath("///evil.com")).toBe(false);
    });

    it("rejects backslash-based redirects", () => {
      expect(isSafeRedirectPath("/\\evil.com")).toBe(false);
      expect(isSafeRedirectPath("\\evil.com")).toBe(false);
      expect(isSafeRedirectPath("\\/evil.com")).toBe(false);
      expect(isSafeRedirectPath("/foo\\bar")).toBe(false);
      expect(isSafeRedirectPath("\\\\evil.com")).toBe(false);
    });

    it("rejects encoded traversal and backslash tricks", () => {
      expect(isSafeRedirectPath("/%2f%2fevil.com")).toBe(false);
      expect(isSafeRedirectPath("/%5cevil.com")).toBe(false);
      expect(isSafeRedirectPath("/%252f%252fevil.com")).toBe(true); // Decodes to /%2f%2fevil.com, which is still safe relative path
    });

    it("rejects control characters, newlines, and whitespace tricks", () => {
      expect(isSafeRedirectPath("/test\nnewline")).toBe(false);
      expect(isSafeRedirectPath("/test\rcarriage")).toBe(false);
      expect(isSafeRedirectPath("/test\ttab")).toBe(false);
      expect(isSafeRedirectPath("/test\0null")).toBe(false);
      expect(isSafeRedirectPath(" /semesters")).toBe(false);
      expect(isSafeRedirectPath("/semesters ")).toBe(true);
    });

    it("rejects non-HTTP schemes", () => {
      expect(isSafeRedirectPath("javascript:alert(1)")).toBe(false);
      expect(isSafeRedirectPath("data:text/html,<script>alert(1)</script>")).toBe(false);
      expect(isSafeRedirectPath("mailto:test@example.com")).toBe(false);
    });

    it("rejects non-string and empty inputs", () => {
      expect(isSafeRedirectPath("")).toBe(false);
      expect(isSafeRedirectPath("   ")).toBe(false);
      expect(isSafeRedirectPath(null)).toBe(false);
      expect(isSafeRedirectPath(undefined)).toBe(false);
      expect(isSafeRedirectPath(123)).toBe(false);
      expect(isSafeRedirectPath({})).toBe(false);
      expect(isSafeRedirectPath([])).toBe(false);
    });
  });

  describe("getSafeRedirectPath", () => {
    it("returns the target when it is safe", () => {
      expect(getSafeRedirectPath("/semesters")).toBe("/semesters");
      expect(getSafeRedirectPath("/exec/interest-meetings?tab=active")).toBe(
        "/exec/interest-meetings?tab=active"
      );
    });

    it("falls back to '/' by default when target is unsafe", () => {
      expect(getSafeRedirectPath("https://evil.com")).toBe("/");
      expect(getSafeRedirectPath("//evil.com")).toBe("/");
      expect(getSafeRedirectPath("/\\evil.com")).toBe("/");
      expect(getSafeRedirectPath(null)).toBe("/");
      expect(getSafeRedirectPath("")).toBe("/");
    });

    it("uses a valid custom fallback when target is unsafe", () => {
      expect(getSafeRedirectPath("https://evil.com", "/semesters")).toBe("/semesters");
    });

    it("falls back to '/' if the custom fallback is itself unsafe", () => {
      expect(getSafeRedirectPath("https://evil.com", "http://evil.org")).toBe("/");
    });
  });
});
