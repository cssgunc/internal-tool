"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { CheckinForm } from "@/components/CheckinForm";

type State =
  | { status: "loading" }
  | { status: "not_found"; message: string }
  | { status: "loaded"; title: string };

export default function MeetingCheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let ignore = false;

    async function loadMeeting() {
      try {
        const res = await api.api.v1.public.checkin[":token"].$get({
          param: { token },
        });

        if (res.ok) {
          const data = await res.json();
          if (!ignore) {
            setState({ status: "loaded", title: data.title });
          }
        } else {
          if (!ignore) {
            setState({
              status: "not_found",
              message: "Meeting not found. This check-in link may be invalid or expired.",
            });
          }
        }
      } catch {
        if (!ignore) {
          setState({
            status: "not_found",
            message: "Unable to load meeting information.",
          });
        }
      }
    }

    void loadMeeting();
    return () => {
      ignore = true;
    };
  }, [token]);

  if (state.status === "loading") {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg py-16 text-center">
          <p role="status" className="text-neutral-600">
            Loading meeting details...
          </p>
        </div>
      </main>
    );
  }

  if (state.status === "not_found") {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm md:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-navy">Meeting Not Found</h1>
          <p className="mt-2 text-neutral-600">{state.message}</p>
          <div className="mt-6">
            <Link
              href="/checkin"
              className="inline-block rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy/90 focus:ring-2 focus:ring-navy focus:ring-offset-2 focus:outline-none"
            >
              Join the Interested List instead
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold tracking-wider text-teal-600 uppercase">
            Interest Meeting
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">{state.title}</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Check in to record your attendance and tell us what teams you&apos;re interested in!
          </p>
        </div>

        <CheckinForm token={token} meetingTitle={state.title} />
      </div>
    </main>
  );
}
