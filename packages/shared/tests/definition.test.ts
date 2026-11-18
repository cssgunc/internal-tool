import { describe, expect, it } from "bun:test";
import { formDefinitionSchema } from "../src";

describe("formDefinitionSchema", () => {
  it("accepts a form with a conditional section", () => {
    const result = formDefinitionSchema.safeParse({
      sections: [
        {
          id: "start",
          title: "What are you applying for?",
          fields: [
            {
              id: "track",
              type: "select",
              label: "Track",
              required: true,
              options: ["project", "education", "both"],
              promote: "track",
            },
          ],
        },
        {
          id: "project",
          title: "Project Team",
          showIf: { field: "track", in: ["project", "both"] },
          fields: [{ id: "skills", type: "long_text", label: "Skills", maxWords: 150 }],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown field type", () => {
    const result = formDefinitionSchema.safeParse({
      sections: [{ id: "a", title: "A", fields: [{ id: "x", type: "signature", label: "X" }] }],
    });

    expect(result.success).toBe(false);
  });
});

describe("formDefinitionSchema consistency checks", () => {
  const field = (id: string) => ({ id, type: "short_text", label: id });

  it.each([
    [
      "a duplicate field id",
      [
        { id: "a", title: "A", fields: [field("email")] },
        { id: "b", title: "B", fields: [field("email")] },
      ],
    ],
    [
      "a duplicate section id",
      [
        { id: "a", title: "A", fields: [field("x")] },
        { id: "a", title: "A again", fields: [field("y")] },
      ],
    ],
    [
      "showIf on a field that doesn't exist",
      [
        { id: "a", title: "A", fields: [field("x")] },
        { id: "b", title: "B", showIf: { field: "missing", in: ["yes"] }, fields: [field("y")] },
      ],
    ],
    [
      "showIf on a field from a later section",
      [
        { id: "a", title: "A", showIf: { field: "y", in: ["yes"] }, fields: [field("x")] },
        { id: "b", title: "B", fields: [field("y")] },
      ],
    ],
    [
      "a label for an option that doesn't exist",
      [
        {
          id: "a",
          title: "A",
          fields: [
            {
              id: "track",
              type: "select",
              label: "Track",
              options: ["project"],
              optionLabels: { projcet: "Project Team" },
            },
          ],
        },
      ],
    ],
  ])("rejects %s", (_name, sections) => {
    expect(formDefinitionSchema.safeParse({ sections }).success).toBe(false);
  });
});
