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
    expect(res.errors.interests).toBe("Required.");
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
    expect(res.errors.project_experience).toBe("Required.");
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

describe("validateAnswers by field type", () => {
  const form: FormDefinition = {
    sections: [
      {
        id: "main",
        title: "Main",
        fields: [
          { id: "name", type: "short_text", label: "Name", required: false, maxLength: 50 },
          {
            id: "year",
            type: "number",
            label: "Year",
            required: false,
            integer: true,
            min: 2020,
            max: 2040,
          },
          { id: "site", type: "url", label: "Site", required: false },
          {
            id: "picks",
            type: "multi_select",
            label: "Picks",
            required: false,
            options: ["a", "b", "c"],
          },
          { id: "agree", type: "checkbox", label: "Agree", required: false },
          { id: "stars", type: "rating", label: "Stars", required: false },
        ],
      },
      {
        id: "about_b",
        title: "About B",
        showIf: { field: "picks", in: ["b"] },
        fields: [{ id: "why_b", type: "long_text", label: "Why B", required: true }],
      },
    ],
  };

  it("accepts well-formed answers of every type", () => {
    expect(
      validateAnswers(form, {
        name: "Jane",
        year: 2029,
        site: "https://janedoe.dev",
        picks: ["a"],
        agree: true,
        stars: 4,
      })
    ).toEqual({ success: true, errors: {} });
  });

  it.each([
    ["name", { name: { first: "Jane" } }, "Invalid answer."],
    ["name", { name: 42 }, "Invalid answer."],
    ["year", { year: "2029" }, "Please enter a number."],
    ["year", { year: 2029.5 }, "Please enter a whole number."],
    ["year", { year: 2019 }, "Must be at least 2020."],
    ["year", { year: 2041 }, "Must be at most 2040."],
    ["site", { site: "janedoe.dev" }, "Please enter a full link, starting with https://."],
    ["site", { site: "javascript:alert(1)" }, "Please enter a full link, starting with https://."],
    ["picks", { picks: "a" }, "Invalid answer."],
    ["picks", { picks: ["a", "z"] }, "Please select only valid options."],
    ["picks", { picks: ["a", "a"] }, "Please select each option only once."],
    ["agree", { agree: "yes" }, "Invalid answer."],
    ["stars", { stars: { evil: true } }, "Please enter a number."],
  ])("rejects a bad %s answer", (field, answers, message) => {
    expect(validateAnswers(form, answers).errors).toEqual({ [field]: message });
  });

  it("shows a section for a multi_select when any chosen value matches", () => {
    expect(validateAnswers(form, { picks: ["a", "b"] }).errors).toEqual({
      why_b: "Required.",
    });
    expect(validateAnswers(form, { picks: ["a", "c"] }).success).toBe(true);
  });
});
