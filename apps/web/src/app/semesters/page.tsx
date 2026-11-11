"use client";

import { createSemesterSchema, updateSemesterDatesSchema } from "@internal-tool/shared";
import type { Semester } from "@internal-tool/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type FormValues = {
  term: "fall" | "spring";
  year: number;
  startsOn: string;
  endsOn: string;
};

type FieldErrors = Record<string, string>;

const emptyForm: FormValues = {
  term: "fall",
  year: new Date().getFullYear(),
  startsOn: "",
  endsOn: "",
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string) {
  return dateFormat.format(new Date(value));
}

function validationFields(result: {
  success: boolean;
  error?: {
    issues: {
      path: PropertyKey[];
      message: string;
    }[];
  };
}): FieldErrors {
  if (result.success || !result.error) return {};

  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.map(String).join(".") || "_root", issue.message])
  );
}

async function responseError(response: Response): Promise<{
  message: string;
  fields: FieldErrors;
}> {
  try {
    const body = (await response.json()) as {
      error?: {
        message?: string;
        fields?: FieldErrors;
      };
    };

    return {
      message: body.error?.message ?? "Request failed.",
      fields: body.error?.fields ?? {},
    };
  } catch {
    return {
      message: "Request failed.",
      fields: {},
    };
  }
}

export default function SemestersPage() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editing, setEditing] = useState<Semester | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.api.v1.semesters.$get({
        query: { pageSize: "200" },
      });

      if (!response.ok) {
        const failure = await responseError(response);
        throw new Error(failure.message);
      }

      const result = await response.json();
      setSemesters(result.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't load semesters.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void load();
    }, 0);

    return () => clearTimeout(timeout);
  }, [load]);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));

    setErrors((previous) => ({
      ...previous,
      [key]: "",
    }));
  }

  function beginEdit(semester: Semester) {
    setEditing(semester);

    setForm({
      term: semester.term,
      year: semester.year,
      startsOn: semester.startsOn,
      endsOn: semester.endsOn,
    });

    setErrors({});
    setMessage("");
  }

  function resetForm() {
    setEditing(null);
    setForm({ ...emptyForm });
    setErrors({});
  }

  async function saveSemester(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setErrors({});

    const parsed = editing
      ? updateSemesterDatesSchema.safeParse({
          startsOn: form.startsOn,
          endsOn: form.endsOn,
        })
      : createSemesterSchema.safeParse(form);

    if (!parsed.success) {
      setErrors(validationFields(parsed));
      return;
    }

    setBusy(true);

    try {
      const response = editing
        ? await api.api.v1.semesters[":id"].$patch({
            param: {
              id: editing.id,
            },
            json: {
              startsOn: form.startsOn,
              endsOn: form.endsOn,
            },
          })
        : await api.api.v1.semesters.$post({
            json: form,
          });

      if (!response.ok) {
        const failure = await responseError(response);

        setErrors(failure.fields);
        setMessage(failure.message);
        return;
      }

      resetForm();

      setMessage(editing ? "Semester updated." : "Semester created.");

      await load();
    } catch {
      setMessage("Couldn't save semester. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function makeCurrent(semester: Semester) {
    if (semester.isCurrent) return;

    const confirmed = window.confirm(
      `Make ${semester.name} the current semester? This will end the previous semester's current status. Positions will not carry over automatically.`
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await api.api.v1.semesters[":id"]["make-current"].$post({
        param: {
          id: semester.id,
        },
      });

      if (!response.ok) {
        const failure = await responseError(response);
        setMessage(failure.message);
        return;
      }

      setMessage(`${semester.name} is now current.`);
      await load();
    } catch {
      setMessage("Couldn't change the current semester.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Semester Administration</h1>

        <p className="mt-2 text-sm text-neutral-600">
          Create semesters, update dates, and manage semester rollover.
        </p>
      </header>

      {message && (
        <p role="status" className="rounded border p-3 text-sm">
          {message}
        </p>
      )}

      <section className="rounded-lg border p-5">
        <h2 className="mb-4 text-lg font-semibold">
          {editing ? `Edit ${editing.name}` : "New semester"}
        </h2>

        <form onSubmit={saveSemester} className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Term
            <select
              className="rounded border p-2"
              value={form.term}
              disabled={busy || editing !== null}
              onChange={(event) => updateField("term", event.target.value as FormValues["term"])}
            >
              <option value="fall">Fall</option>
              <option value="spring">Spring</option>
            </select>
            {errors.term && <span className="text-red-700">{errors.term}</span>}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Year
            <input
              className="rounded border p-2"
              type="number"
              min="2000"
              max="2100"
              required
              value={form.year}
              disabled={busy || editing !== null}
              onChange={(event) => updateField("year", Number(event.target.value))}
            />
            {errors.year && <span className="text-red-700">{errors.year}</span>}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Start date
            <input
              className="rounded border p-2"
              type="date"
              required
              value={form.startsOn}
              disabled={busy}
              onChange={(event) => updateField("startsOn", event.target.value)}
            />
            {errors.startsOn && <span className="text-red-700">{errors.startsOn}</span>}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            End date
            <input
              className="rounded border p-2"
              type="date"
              required
              value={form.endsOn}
              disabled={busy}
              onChange={(event) => updateField("endsOn", event.target.value)}
            />
            {errors.endsOn && <span className="text-red-700">{errors.endsOn}</span>}
          </label>

          {errors._root && <p className="text-sm text-red-700 sm:col-span-2">{errors._root}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy ? "Saving..." : editing ? "Save dates" : "Create semester"}
            </button>

            {editing && (
              <button
                type="button"
                disabled={busy}
                onClick={resetForm}
                className="rounded border px-4 py-2 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">All semesters</h2>

        {loading ? (
          <p>Loading semesters...</p>
        ) : semesters.length === 0 ? (
          <p>No semesters yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-3">Semester</th>
                  <th className="p-3">Start</th>
                  <th className="p-3">End</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {semesters.map((semester) => (
                  <tr key={semester.id} className="border-b">
                    <td className="p-3 font-medium">{semester.name}</td>

                    <td className="p-3">{formatDate(semester.startsOn)}</td>

                    <td className="p-3">{formatDate(semester.endsOn)}</td>

                    <td className="p-3">
                      {semester.isCurrent ? (
                        <span className="font-semibold text-green-700">Current</span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="flex flex-wrap gap-2 p-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => beginEdit(semester)}
                        className="rounded border px-3 py-1 disabled:opacity-50"
                      >
                        Edit dates
                      </button>

                      {!semester.isCurrent && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void makeCurrent(semester)}
                          className="rounded border px-3 py-1 disabled:opacity-50"
                        >
                          Make current
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
