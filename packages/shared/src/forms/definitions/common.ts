import type { z } from "zod";
import type { fieldSchema, sectionSchema } from "../definition";

type FieldInput = z.input<typeof fieldSchema>;
type SectionInput = z.input<typeof sectionSchema>;

// Questions that more than one application asks, so they're worded the same everywhere.
// Promoted fields use the column name as their id (TDD 3.1 submissions).

export const YES_NO = {
  options: ["yes", "no"],
  optionLabels: { yes: "Yes", no: "No" },
};

export const contactFields: FieldInput[] = [
  { id: "email", type: "email", label: "Email", required: true, maxLength: 254, promote: "email" },
  {
    id: "first_name",
    type: "short_text",
    label: "First name",
    required: true,
    maxLength: 100,
    promote: "first_name",
  },
  {
    id: "last_name",
    type: "short_text",
    label: "Last name",
    required: true,
    maxLength: 100,
    promote: "last_name",
  },
];

export const gradYearField: FieldInput = {
  id: "grad_year",
  type: "number",
  label: "Expected graduation year",
  required: true,
  integer: true,
  min: 2020,
  max: 2040,
  promote: "grad_year",
};

export const resumeField: FieldInput = {
  id: "resume_url",
  type: "url",
  label: "Resume (link)",
  required: true,
  maxLength: 2048,
};

export const pastMemberField: FieldInput = {
  id: "past_member",
  type: "select",
  label: "Are you, or have you ever been, a CSSG member?",
  required: true,
  ...YES_NO,
};

// Follows the section that holds pastMemberField.
export const pastMembershipSection: SectionInput = {
  id: "past_membership",
  title: "Your time in CSSG",
  showIf: { field: "past_member", in: ["yes"] },
  fields: [
    {
      id: "past_roles",
      type: "long_text",
      label: "Which semester(s), and what role?",
      required: true,
      maxLength: 1000,
    },
  ],
};
