"use client";

import type { Semester } from "@internal-tool/shared";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type State =
  { status: "loading" } | { status: "error" } | { status: "loaded"; semesters: Semester[] };

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
        const res = await api.api.v1.semesters.$get();
        if (!res.ok) throw new Error(`GET /semesters failed with ${res.status}`);
        const { items } = await res.json();
        if (!ignore) setState({ status: "loaded", semesters: items });
      } catch {
        if (!ignore) setState({ status: "error" });
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
          Couldn&apos;t load semesters. Refresh the page to try again.
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
