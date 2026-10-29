import { describe, expect, test } from "bun:test";
import { renderTemplate, findDisallowedPlaceholders } from "../src/email-templates";

describe("Email template rendering", () => {
  test("replaces placeholders with values", () => {
    const result = renderTemplate("Hello {{firstName}}!", { firstName: "Sarah" }, ["firstName"]);

    expect(result.rendered).toBe("Hello Sarah!");
    expect(result.errors).toEqual([]);
  });

  test("escapes HTML", () => {
    const result = renderTemplate(
      "Hello {{firstName}}!",
      { firstName: "<script>alert(1)</script>" },
      ["firstName"]
    );

    expect(result.rendered).toBe("Hello &lt;script&gt;alert(1)&lt;/script&gt;!");
  });

  test("rejects unknown placeholders", () => {
    const result = renderTemplate("Hello {{unknown}}!", { unknown: "test" }, ["firstName"]);

    expect(result.errors.length).toBe(1);
  });

  test("detects disallowed placeholders", () => {
    const result = findDisallowedPlaceholders(
      "rejection",
      "Hello {{firstName}}",
      "Your project is {{projectName}}"
    );

    expect(result).toEqual(["projectName"]);
  });
});
