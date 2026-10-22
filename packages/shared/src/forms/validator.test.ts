import { describe, expect, it } from "bun:test";
import type { FormDefinition } from "./definition";
import { validateAnswers } from "./validator";

const sampleDef: FormDefinition = {
  sections: [
    {
      id: "sec_general",
      title: "General",
      fields: [
        {
          id: "email",
          label: "Email Address",
          type: "email",
          required: true,
        },
        {
          id: "track",
          label: "Track Selection",
          type: "select",
          required: true,
          options: ["Project", "Education", "Both"],
        },
        {
          id: "bio",
          label: "Short Bio",
          type: "long_text",
          required: false,
          maxWords: 5,
          maxLength: 30,
        },
      ],
    },
    {
      id: "sec_project",
      title: "Project Questions",
      showIf: {
        field: "track",
        in: ["Project", "Both"],
      },
      fields: [
        {
          id: "github",
          label: "GitHub Handle",
          type: "short_text",
          required: true,
        },
      ],
    },
  ],
};

describe("validateAnswers", () => {
  it("fails when a required field is missing", () => {
    const result = validateAnswers(sampleDef, {});

    expect(result.success).toBe(false);
    expect(result.errors.email).toBe("Email Address is required.");
    expect(result.errors.track).toBe("Track Selection is required.");
  });

  it("flags invalid email format", () => {
    const result = validateAnswers(sampleDef, {
      email: "notanemail",
      track: "Education",
    });

    expect(result.success).toBe(false);
    expect(result.errors.email).toBe("Please enter a valid email address.");
  });
  it("flags select values that are not in options", () => {
    const result = validateAnswers(sampleDef, {
      email: "test@unc.edu",
      track: "NotARealTrack",
    });

    expect(result.success).toBe(false);
    expect(result.errors.track).toBe("Please select a valid option.");
  });

  it("enforces maxLength", () => {
    const result = validateAnswers(sampleDef, {
      email: "test@unc.edu",
      track: "Education",
      bio: "supercalifragilisticexpialidocious_extra_characters",
    });

    expect(result.success).toBe(false);
    expect(result.errors.bio).toBe("Cannot exceed 30 characters.");
  });

  it("enforces maxWords", () => {
    const result = validateAnswers(sampleDef, {
      email: "test@unc.edu",
      track: "Education",
      bio: "one two three four five six",
    });

    expect(result.success).toBe(false);
    expect(result.errors.bio).toBe("Cannot exceed 5 words.");
  });

  it("ignores required fields inside hidden sections (showIf)", () => {
    // track is 'Education', so 'sec_project' is hidden -> github is not required
    const result = validateAnswers(sampleDef, {
      email: "test@unc.edu",
      track: "Education",
    });

    expect(result.success).toBe(true);
    expect(result.errors.github).toBeUndefined();
  });

  it("enforces required fields when showIf condition is met", () => {
    // track is 'Project', so 'sec_project' is shown -> github is required
    const result = validateAnswers(sampleDef, {
      email: "test@unc.edu",
      track: "Project",
    });

    expect(result.success).toBe(false);
    expect(result.errors.github).toBe("GitHub Handle is required.");
  });
});
