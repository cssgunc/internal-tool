import type { z } from "zod";
import { defineForm } from "../definition";
import type { sectionSchema } from "../definition";
import {
  contactFields,
  gradYearField,
  pastMemberField,
  pastMembershipSection,
  resumeField,
} from "./common";

// The positions an exec applicant can pick: the exec-granting positions seeded in
// apps/api/src/db/seed.ts, plus "Other". Positions are managed by superusers (TDD 2.1),
// so update this list when they change.
export const EXEC_APPLICATION_POSITIONS = {
  co_president: "Co-President",
  vp_strategy: "VP of Strategy",
  treasurer: "Treasurer",
  vp_outreach: "VP of Outreach",
  head_of_design: "Head of Design",
  education_lead: "Education Lead",
  education_ta: "Education TA",
  project_manager: "Project Manager (PM)",
  lead_engineer: "Lead Engineer (TL)",
  other: "Other",
} as const;

const positionIds = Object.keys(EXEC_APPLICATION_POSITIONS);

// The same four questions for each position the applicant picks, 150 words each.
// Field ids are prefixed with the position, e.g. treasurer_why.
export const PER_POSITION_QUESTIONS = {
  why: "Why are you interested in this position?",
  stand_out: "What sets you apart?",
  improve: "What would you improve or continue in this role?",
  communication: "Tell us about a time you used communication to reach a goal or fix a problem.",
} as const;

function positionSection(id: string, name: string): z.input<typeof sectionSchema> {
  return {
    id: `position_${id}`,
    title: name,
    showIf: { field: "positions", in: [id] },
    fields: Object.entries(PER_POSITION_QUESTIONS).map(([question, label]) => ({
      id: `${id}_${question}`,
      type: "long_text",
      label,
      required: true,
      maxWords: 150,
      // 150 words is roughly 1,000 characters; this leaves room without allowing essays.
      maxLength: 1500,
    })),
  };
}

// Exec application (TDD 2.3), public. "Attended Interest Meeting" is set by the
// system from check-ins, never asked.
export const execApplicationForm = defineForm({
  sections: [
    {
      id: "about",
      title: "About you",
      fields: [
        ...contactFields,
        // Deleted with the application if the applicant isn't selected (TDD 2.5).
        { id: "pid", type: "short_text", label: "PID", required: true, maxLength: 9 },
        {
          id: "areas_of_study",
          type: "short_text",
          label: "Areas of study (majors and minors)",
          required: true,
          maxLength: 300,
        },
        gradYearField,
        pastMemberField,
      ],
    },
    pastMembershipSection,
    {
      id: "positions",
      title: "Positions",
      fields: [
        {
          id: "positions",
          type: "multi_select",
          label: "Which exec position(s) are you applying for?",
          required: true,
          options: positionIds,
          optionLabels: EXEC_APPLICATION_POSITIONS,
        },
      ],
    },
    {
      id: "other_position",
      title: "Other position",
      showIf: { field: "positions", in: ["other"] },
      fields: [
        {
          id: "other_position_description",
          type: "long_text",
          label: "Describe the position you have in mind.",
          required: true,
          maxLength: 1000,
        },
      ],
    },
    ...Object.entries(EXEC_APPLICATION_POSITIONS).map(([id, name]) => positionSection(id, name)),
    {
      id: "closing",
      title: "Last few questions",
      fields: [
        {
          id: "cssg_idea",
          type: "long_text",
          label: "Share an idea or innovation for CSSG.",
          required: true,
          maxLength: 2000,
        },
        {
          id: "anything_else",
          type: "long_text",
          label: "Anything else you'd like to share?",
          maxLength: 2000,
        },
        resumeField,
      ],
    },
  ],
});
