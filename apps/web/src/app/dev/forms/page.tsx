import { notFound } from "next/navigation";
import type { FormDefinition } from "@internal-tool/shared";
import { FormRenderer } from "@/components/FormRenderer";

const newMemberApplicationMock: FormDefinition = {
  sections: [
    {
      id: "sec_track_selection",
      title: "Track Application",
      fields: [
        {
          id: "email",
          type: "email",
          label: "Email Address",
          required: true,
        },
        {
          id: "track",
          type: "select",
          label: "Which track are you applying for?",
          required: true,
          options: ["project", "education", "both"],
        },
      ],
    },
    {
      id: "sec_project_questions",
      title: "Project Track Questions",
      showIf: {
        field: "track",
        in: ["project", "both"],
      },
      fields: [
        {
          id: "project_experience",
          type: "long_text",
          label: "Describe your software development experience.",
          required: true,
          maxWords: 150,
        },
      ],
    },
    {
      id: "sec_education_questions",
      title: "Education Track Questions",
      showIf: {
        field: "track",
        in: ["education", "both"],
      },
      fields: [
        {
          id: "teaching_interest",
          type: "long_text",
          label: "Why do you want to teach CS concepts?",
          required: true,
          maxWords: 150,
        },
      ],
    },
    {
      id: "sec_future_fields",
      title: "Unsupported Field Test",
      fields: [
        {
          id: "rating_sample",
          type: "rating",
          label: "Rate your comfort level with Git",
          required: false,
        },
      ],
    },
  ],
};

export default function DevFormsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">New-Member Application (TDD 2.3)</h1>
      <p className="mt-1 mb-6 text-sm text-gray-600">
        Development sandbox for testing FormRenderer, conditional showIf sections, and answer
        validation.
      </p>

      <FormRenderer definition={newMemberApplicationMock} />
    </main>
  );
}
