import { describe, expect, it } from "bun:test";
import type { FormDefinition } from "../src/forms/definition";
import { filterVisibleAnswers, validateAnswers } from "../src/forms/validator";

const sampleDefinition: FormDefinition = {
  sections: [
    {
      id: "sec_basic",
      title: "Basic Info",
      fields: [
        { id: "email", type: "email", label: "Email", required: true },
        {
          id: "track",
          type: "select",
          label: "Track",
          required: true,
          options: ["project", "education", "both"],
        },
        {
          id: "interests",
          type: "multi_select",
          label: "Interests",
          required: true,
        },
      ],
    },
    {
      id: "sec_project",
      title: "Project Questions",
      showIf: { field: "track", in: ["project", "both"] },
      fields: [
        {
          id: "project_experience",
          type: "long_text",
          label: "Experience",
          required: true,
          maxLength: 10,
          maxWords: 2,
        },
      ],
    },
    {
      id: "sec_education",
      title: "Education Questions",
      showIf: { field: "track", in: ["education", "both"] },
      fields: [
        {
          id: "teaching_interest",
          type: "long_text",
          label: "Teaching",
          required: true,
        },
      ],
    },
  ],
};

describe("validateAnswers", () => {
  it("fails when a required field is missing", () => {
    const res = validateAnswers(sampleDefinition, {});
    expect(res.success).toBe(false);
    expect(res.errors.email).toBeDefined();
  });

  it("fails when a required multi_select is an empty array", () => {
    const res = validateAnswers(sampleDefinition, {
      email: "test@unc.edu",
      track: "project",
      interests: [],
    });
    expect(res.success).toBe(false);
    expect(res.errors.interests).toBe("Interests is required.");
  });

  it("flags invalid email format", () => {
    const res = validateAnswers(sampleDefinition, {
      email: "bademail",
      track: "project",
      interests: ["dev"],
    });
    expect(res.success).toBe(false);
    expect(res.errors.email).toBe("Please enter a valid email address.");
  });

  it("flags select values that are not in options", () => {
    const res = validateAnswers(sampleDefinition, {
      email: "user@unc.edu",
      track: "invalid_track",
      interests: ["dev"],
    });
    expect(res.success).toBe(false);
    expect(res.errors.track).toBe("Please select a valid option.");
  });

  it("enforces maxLength before maxWords", () => {
    const res = validateAnswers(sampleDefinition, {
      email: "user@unc.edu",
      track: "project",
      interests: ["dev"],
      project_experience: "This string is way too long",
    });
    expect(res.success).toBe(false);
    expect(res.errors.project_experience).toBe("Cannot exceed 10 characters.");
  });

  it("enforces maxWords when within maxLength", () => {
    const res = validateAnswers(sampleDefinition, {
      email: "user@unc.edu",
      track: "project",
      interests: ["dev"],
      project_experience: "a b c",
    });
    expect(res.success).toBe(false);
    expect(res.errors.project_experience).toBe("Cannot exceed 2 words.");
  });

  it("ignores required fields inside hidden sections (showIf)", () => {
    const res = validateAnswers(sampleDefinition, {
      email: "user@unc.edu",
      track: "education",
      interests: ["dev"],
      teaching_interest: "I love teaching",
    });
    expect(res.success).toBe(true);
    expect(res.errors.project_experience).toBeUndefined();
  });

  it("enforces required fields when showIf condition is met", () => {
    const res = validateAnswers(sampleDefinition, {
      email: "user@unc.edu",
      track: "project",
      interests: ["dev"],
    });
    expect(res.success).toBe(false);
    expect(res.errors.project_experience).toBe("Experience is required.");
  });
});

describe("filterVisibleAnswers", () => {
  it("drops answers from hidden sections on submission", () => {
    const answers = {
      email: "user@unc.edu",
      track: "education",
      interests: ["dev"],
      project_experience: "Hidden project answer that should be stripped",
      teaching_interest: "Visible education answer",
    };

    const sanitized = filterVisibleAnswers(sampleDefinition, answers);

    expect(sanitized.email).toBe("user@unc.edu");
    expect(sanitized.track).toBe("education");
    expect(sanitized.teaching_interest).toBe("Visible education answer");
    expect(sanitized.project_experience).toBeUndefined();
  });
});
