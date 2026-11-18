import Link from "next/link";
import { notFound } from "next/navigation";
import {
  execApplicationForm,
  newMemberForm,
  returningMemberForm,
  type FormDefinition,
} from "@internal-tool/shared";
import { FormRenderer } from "@/components/FormRenderer";

// The recruiting forms from TDD 2.3, keyed like form_key (TDD 3.1).
const FORMS: Record<string, { title: string; definition: FormDefinition }> = {
  new_member: { title: "New-Member Application", definition: newMemberForm },
  exec: { title: "Exec Application", definition: execApplicationForm },
  returning: { title: "Returning-Member Form", definition: returningMemberForm },
};

export default async function DevFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ form?: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { form = "new_member" } = await searchParams;
  const current = FORMS[form] ?? FORMS.new_member!;
  const currentKey = FORMS[form] ? form : "new_member";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Form preview (TDD 2.3)</h1>
      <p className="mt-1 mb-4 text-sm text-gray-600">
        Development sandbox for the recruiting form definitions. Nothing is submitted.
      </p>

      <nav aria-label="Forms" className="mb-6 flex flex-wrap gap-2">
        {Object.entries(FORMS).map(([key, { title }]) => (
          <Link
            key={key}
            href={`/dev/forms?form=${key}`}
            aria-current={key === currentKey ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              key === currentKey
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {title}
          </Link>
        ))}
      </nav>

      <h2 className="mb-4 text-lg font-semibold text-gray-900">{current.title}</h2>
      {/* The key resets the answers when switching forms. */}
      <FormRenderer key={currentKey} definition={current.definition} />
    </main>
  );
}
