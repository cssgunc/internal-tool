"use client";

import type { Semester } from "@internal-tool/shared";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; semesters: Semester[] };

// Used when there's no API message to show, e.g. the API is down and the proxy answers.
const FALLBACK_ERROR = "Couldn't load semesters.";

// Dates arrive as "YYYY-MM-DD", which JavaScript reads as midnight UTC. Formatting
// in UTC keeps that calendar day; local time would show Aug 17 as Aug 16 in Eastern.
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function formatDate(isoDate: string) {
  return dateFormat.format(new Date(isoDate));
}

// Client component: the typed client uses relative /api URLs, which only the
// browser can resolve (Next.js forwards them to the API).
export default function SemestersPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        // First page (up to 50, newest first) covers every semester for years to come.
        const res = await api.api.v1.semesters.$get({ query: {} });
        if (res.ok) {
          const { items } = await res.json();
          if (!ignore) setState({ status: "loaded", semesters: items });
        } else {
          // Errors use the standard envelope: { error: { code, message } }.
          const { error } = await res.json();
          if (!ignore) setState({ status: "error", message: error.message });
        }
      } catch {
        if (!ignore) setState({ status: "error", message: FALLBACK_ERROR });
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Semesters</h1>

      {state.status === "loading" && <p role="status">Loading semesters…</p>}

      {state.status === "error" && (
        <p role="alert" className="text-red-700">
          {state.message} Refresh the page to try again.
        </p>
      )}

      {state.status === "loaded" && state.semesters.length === 0 && <p>No semesters yet.</p>}

      {state.status === "loaded" && state.semesters.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-neutral-300">
              <th className="py-2">Name</th>
              <th className="py-2">Starts</th>
              <th className="py-2">Ends</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {state.semesters.map((semester) => (
              <tr key={semester.id} className="border-b border-neutral-200">
                <td className="py-2">{semester.name}</td>
                <td className="py-2">{formatDate(semester.startsOn)}</td>
                <td className="py-2">{formatDate(semester.endsOn)}</td>
                <td className="py-2">{semester.isCurrent ? "Current" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
