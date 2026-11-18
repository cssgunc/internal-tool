import { defineForm } from "../definition";
import {
  contactFields,
  gradYearField,
  pastMemberField,
  pastMembershipSection,
  resumeField,
} from "./common";

// New-member application (TDD 2.3), public. The track choice decides which of the
// Project and Education sections appear; "Both" shows both.
export const newMemberForm = defineForm({
  sections: [
    {
      id: "track",
      title: "What are you applying for?",
      fields: [
        {
          id: "track",
          type: "select",
          label: "Which team are you applying for?",
          required: true,
          // application_track values (TDD 3.1)
          options: ["project", "education", "both"],
          optionLabels: { project: "Project Team", education: "Education Team", both: "Both" },
          promote: "track",
        },
      ],
    },
    {
      id: "about",
      title: "About you",
      fields: [
        ...contactFields,
        { id: "majors", type: "short_text", label: "Major(s)", required: true, maxLength: 200 },
        { id: "minors", type: "short_text", label: "Minor(s)", maxLength: 200 },
        gradYearField,
        resumeField,
        {
          id: "commitments",
          type: "long_text",
          label: "What extracurriculars or other time commitments do you expect to have?",
          required: true,
          maxLength: 2000,
        },
        {
          id: "commitment_hours",
          type: "number",
          label: "About how many hours per week do those take?",
          required: true,
          integer: true,
          min: 0,
          max: 168,
        },
        pastMemberField,
      ],
    },
    pastMembershipSection,
    {
      id: "project",
      title: "Project Team",
      showIf: { field: "track", in: ["project", "both"] },
      fields: [
        {
          id: "role_preference",
          type: "select",
          label: "Preferred role (not binding, it just helps us plan)",
          required: true,
          // role_preference values (TDD 3.1)
          options: ["backend", "frontend", "fullstack", "ui"],
          optionLabels: {
            backend: "Backend",
            frontend: "Frontend",
            fullstack: "Fullstack",
            ui: "UI",
          },
          promote: "role_preference",
        },
        {
          id: "skills",
          type: "long_text",
          label: "What skills, software, and languages have you worked with?",
          required: true,
          maxLength: 2000,
        },
        {
          id: "proud_project",
          type: "long_text",
          label: "Tell us about a project you're proud of or learned from.",
          required: true,
          maxLength: 3000,
        },
        {
          id: "portfolio_url",
          type: "url",
          label: "Website or portfolio (optional, encouraged for UI)",
          maxLength: 2048,
        },
      ],
    },
    {
      id: "education",
      title: "Education Team",
      showIf: { field: "track", in: ["education", "both"] },
      fields: [
        {
          id: "learning_goals",
          type: "long_text",
          label: "What do you want to learn? Are there topics you're interested in?",
          required: true,
          maxLength: 2000,
        },
        {
          // TODO(wording): placeholder until exec finalizes this question (‼️ in TDD 2.3).
          // It should be lighter than the Project Team's project question.
          id: "programming_experience",
          type: "long_text",
          label: "What programming experience do you have, if any?",
          required: true,
          maxLength: 2000,
        },
      ],
    },
    {
      id: "optional",
      title: "Optional",
      fields: [
        {
          id: "org_interests",
          type: "long_text",
          label: "Are there community or student orgs you'd want to work with, or project ideas?",
          maxLength: 2000,
        },
        {
          id: "anything_else",
          type: "long_text",
          label: "Anything else you'd like to share?",
          maxLength: 2000,
        },
      ],
    },
  ],
});
