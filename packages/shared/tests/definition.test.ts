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
