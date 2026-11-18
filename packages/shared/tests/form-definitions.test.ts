import { describe, expect, it } from "bun:test";
import {
  EXEC_APPLICATION_POSITIONS,
  PROMOTED_FIELDS,
  execApplicationForm,
  filterVisibleAnswers,
  formDefinitionSchema,
  isSectionVisible,
  newMemberForm,
  returningMemberForm,
  validateAnswers,
} from "../src";
import type { FormDefinition, FormField } from "../src";

const forms: [string, FormDefinition][] = [
  ["new-member", newMemberForm],
  ["exec application", execApplicationForm],
  ["returning-member", returningMemberForm],
];

const allFields = (form: FormDefinition): FormField[] =>
  form.sections.flatMap((section) => section.fields);

// Required fields in the sections these answers make visible: the errors an empty
// submission with these answers should get.
const visibleRequired = (form: FormDefinition, answers: Record<string, unknown>) =>
  form.sections
    .filter((section) => isSectionVisible(section, answers))
    .flatMap((section) => section.fields)
    .filter((field) => field.required && !(field.id in answers))
    .map((field) => field.id)
    .sort();

// Realistic applications, filled in the way the renderer sends them.
const newMemberBoth = {
  track: "both",
  email: "jdoe@unc.edu",
  first_name: "Jane",
  last_name: "Doe",
  majors: "Computer Science",
  minors: "Statistics",
  grad_year: 2029,
  resume_url: "https://drive.google.com/file/d/1AbC/view",
  commitments: "Club soccer and a part-time job at the library.",
  commitment_hours: 12,
  past_member: "no",
  role_preference: "backend",
  skills: "Python, TypeScript, SQL, Git, and a little Docker.",
  proud_project:
    "I built a course-planning tool for my dorm that pulls class times and finds schedules without conflicts.",
  portfolio_url: "https://janedoe.dev",
  learning_goals: "Web development and how to teach intro programming.",
  programming_experience: "COMP 110 and 210, plus personal projects.",
  org_interests: "A tutoring nonprofit in Durham.",
};

const execApplication = {
  email: "sam.lee@unc.edu",
  first_name: "Sam",
  last_name: "Lee",
  pid: "730123456",
  areas_of_study: "Business Administration, minor in Computer Science",
  grad_year: 2028,
  past_member: "yes",
  past_roles: "Fall 2025 and Spring 2026, Developer on the Peer2Peer team.",
  positions: ["treasurer", "other"],
  other_position_description: "A partnerships lead who finds new nonprofit clients.",
  treasurer_why: "I manage the budget for my dorm council and want to do the same for CSSG.",
  treasurer_stand_out: "I'm organized and have handled reimbursements before.",
  treasurer_improve: "I'd publish a simple budget each semester so members know where funds go.",
  treasurer_communication:
    "I settled a funding disagreement by laying out the numbers for everyone.",
  other_why: "Our client pipeline depends on a few people's personal contacts.",
  other_stand_out: "I've cold-emailed and signed two nonprofits for my last org.",
  other_improve: "I'd keep a shared list of past and potential clients.",
  other_communication: "I ran weekly check-ins with a client to keep a project on track.",
  cssg_idea: "A spring showcase where teams demo to their nonprofit partners.",
  resume_url: "https://example.com/sam-lee-resume.pdf",
};

describe.each(forms)("%s form", (_name, form) => {
  it("parses with the definition schema", () => {
    expect(formDefinitionSchema.safeParse(form).success).toBe(true);
  });

  it("gives every free-text field a maxLength", () => {
    const textTypes = ["short_text", "long_text", "email", "url"];
    const missing = allFields(form)
      .filter((field) => textTypes.includes(field.type) && field.maxLength === undefined)
      .map((field) => field.id);
    expect(missing).toEqual([]);
  });

  it("gives every choice field options and a label for each", () => {
    for (const field of allFields(form)) {
      if (field.type !== "select" && field.type !== "multi_select") continue;
      expect(field.options?.length).toBeGreaterThan(0);
      expect(Object.keys(field.optionLabels ?? {}).sort()).toEqual([...field.options!].sort());
    }
  });

  it("names each promoted field after its database column", () => {
    for (const field of allFields(form)) {
      if (field.promote) expect(field.id).toBe(field.promote);
    }
  });
});

describe("new-member form", () => {
  it("promotes every field the database filters on", () => {
    const promoted = allFields(newMemberForm).flatMap((field) => field.promote ?? []);
    expect(promoted.sort()).toEqual([...PROMOTED_FIELDS].sort());
  });

  it("uses the database enum values for track and preferred role", () => {
    const field = (id: string) => allFields(newMemberForm).find((f) => f.id === id);
    // application_track and role_preference (TDD 3.1)
    expect(field("track")?.options).toEqual(["project", "education", "both"]);
    expect(field("role_preference")?.options).toEqual(["backend", "frontend", "fullstack", "ui"]);
  });

  it.each([
    ["project", ["project"]],
    ["education", ["education"]],
    ["both", ["project", "education"]],
  ])("shows only the matching sections for track %p", (track, shown) => {
    const visible = newMemberForm.sections
      .filter((section) => isSectionVisible(section, { track }))
      .map((section) => section.id);
    expect(visible).toEqual(["track", "about", ...shown, "optional"]);
  });

  it("accepts a realistic application for both teams", () => {
    expect(validateAnswers(newMemberForm, newMemberBoth)).toEqual({ success: true, errors: {} });
  });

  it("accepts a project-only application without the education answers", () => {
    const {
      learning_goals: _goals,
      programming_experience: _experience,
      ...answers
    } = newMemberBoth;
    expect(validateAnswers(newMemberForm, { ...answers, track: "project" }).success).toBe(true);
  });

  it("accepts an education-only application without the project answers", () => {
    const {
      role_preference: _role,
      skills: _skills,
      proud_project: _proud,
      ...answers
    } = newMemberBoth;
    expect(validateAnswers(newMemberForm, { ...answers, track: "education" }).success).toBe(true);
  });

  it.each(["project", "education", "both"])(
    "with track %p, flags missing required answers only in visible sections",
    (track) => {
      const answers = { track };
      const result = validateAnswers(newMemberForm, answers);
      expect(Object.keys(result.errors).sort()).toEqual(visibleRequired(newMemberForm, answers));
    }
  );

  it("requires the membership details only from past members", () => {
    const pastMember = { ...newMemberBoth, past_member: "yes" };
    expect(validateAnswers(newMemberForm, pastMember).errors).toEqual({
      past_roles: "Required.",
    });
  });

  it("drops answers from sections hidden by the track", () => {
    const kept = filterVisibleAnswers(newMemberForm, { ...newMemberBoth, track: "education" });
    expect(kept.skills).toBeUndefined();
    expect(kept.role_preference).toBeUndefined();
    expect(kept.learning_goals).toBe(newMemberBoth.learning_goals);
  });

  it("rejects a graduation year that isn't a plausible whole year", () => {
    for (const grad_year of [2029.5, 1999, "2029"]) {
      expect(
        validateAnswers(newMemberForm, { ...newMemberBoth, grad_year }).errors.grad_year
      ).toBeDefined();
    }
  });
});

describe("exec application form", () => {
  const positionSections = execApplicationForm.sections.filter((s) => s.id.startsWith("position_"));

  it("promotes the contact fields and graduation year", () => {
    const promoted = allFields(execApplicationForm).flatMap((field) => field.promote ?? []);
    expect(promoted.sort()).toEqual(["email", "first_name", "grad_year", "last_name"]);
  });

  it("has a section of four questions for each position", () => {
    expect(positionSections.map((s) => s.showIf?.in)).toEqual(
      Object.keys(EXEC_APPLICATION_POSITIONS).map((id) => [id])
    );
    for (const section of positionSections) expect(section.fields).toHaveLength(4);
  });

  it("limits every per-position answer to 150 words", () => {
    for (const field of positionSections.flatMap((s) => s.fields)) {
      expect(field.maxWords).toBe(150);
    }
  });

  it("shows the questions only for the positions picked", () => {
    const visible = positionSections
      .filter((section) => isSectionVisible(section, { positions: ["treasurer", "other"] }))
      .map((section) => section.id);
    expect(visible).toEqual(["position_treasurer", "position_other"]);
  });

  it("accepts a realistic application for two positions", () => {
    expect(validateAnswers(execApplicationForm, execApplication)).toEqual({
      success: true,
      errors: {},
    });
  });

  it("flags missing answers only for the positions picked", () => {
    const answers = { positions: ["vp_outreach"] };
    const result = validateAnswers(execApplicationForm, answers);
    const errors = Object.keys(result.errors);
    expect(errors.sort()).toEqual(visibleRequired(execApplicationForm, answers));
    expect(errors).toContain("vp_outreach_why");
    expect(errors).not.toContain("treasurer_why");
    expect(errors).not.toContain("other_position_description");
  });

  it("rejects a per-position answer over 150 words", () => {
    const essay = Array.from({ length: 151 }, () => "word").join(" ");
    expect(
      validateAnswers(execApplicationForm, { ...execApplication, treasurer_why: essay }).errors
    ).toEqual({ treasurer_why: "Cannot exceed 150 words." });
  });

  it("rejects a position that isn't on the list", () => {
    expect(
      validateAnswers(execApplicationForm, { ...execApplication, positions: ["supreme_leader"] })
        .errors.positions
    ).toBe("Please select only valid options.");
  });
});

describe("returning-member form", () => {
  it("accepts a member who is returning to the same team", () => {
    expect(
      validateAnswers(returningMemberForm, { returning: "yes", team_choice: "same" }).success
    ).toBe(true);
  });

  it("accepts a member who isn't returning without asking about teams", () => {
    expect(validateAnswers(returningMemberForm, { returning: "no" })).toEqual({
      success: true,
      errors: {},
    });
  });

  it("asks a returning member which team they want", () => {
    expect(Object.keys(validateAnswers(returningMemberForm, { returning: "yes" }).errors)).toEqual([
      "team_choice",
    ]);
  });
});
