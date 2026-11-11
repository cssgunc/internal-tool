"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { CheckinForm } from "@/components/CheckinForm";

type State =
  | { status: "loading" }
  | { status: "loaded"; title: string }
  | { status: "not_found"; message: string }
  | { status: "server_error"; message: string }
  | { status: "network_error"; message: string };

export default function MeetingCheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<State>({ status: "loading" });
  const [prevToken, setPrevToken] = useState(token);
  const [retryCount, setRetryCount] = useState(0);

  // Immediately transition to loading on token change before next paint
  if (prevToken !== token) {
    setPrevToken(token);
    setState({ status: "loading" });
  }

  const handleRetry = () => {
    setState({ status: "loading" });
    setRetryCount((prev) => prev + 1);
  };

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
        } else if (res.status === 404) {
          if (!ignore) {
            setState({
              status: "not_found",
              message: "Meeting not found. This check-in link may be invalid or expired.",
            });
          }
        } else {
          if (!ignore) {
            setState({
              status: "server_error",
              message:
                "A temporary server error occurred while loading meeting details. Please try again.",
            });
          }
        }
      } catch {
        if (!ignore) {
          setState({
            status: "network_error",
            message:
              "Unable to connect to the server. Please check your internet connection and try again.",
          });
        }
      }
    }

    void loadMeeting();
    return () => {
      ignore = true;
    };
  }, [token, retryCount]);

  if (state.status === "loading") {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8">
        <div
          role="status"
          aria-live="polite"
          className="mx-auto flex max-w-lg flex-col items-center justify-center py-16 text-center"
        >
          <svg
            className="h-10 w-10 animate-spin text-navy"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          <p className="mt-4 text-sm font-medium text-neutral-600">Loading meeting details...</p>
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

  if (state.status === "server_error") {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm md:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-navy">Server Error</h1>
          <p className="mt-2 text-neutral-600">{state.message}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy/90 focus:ring-2 focus:ring-navy focus:ring-offset-2 focus:outline-none"
            >
              Try Again
            </button>
            <Link
              href="/checkin"
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 focus:ring-2 focus:ring-navy focus:ring-offset-2 focus:outline-none"
            >
              Join the Interested List instead
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (state.status === "network_error") {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm md:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-navy">
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-navy">Connection Error</h1>
          <p className="mt-2 text-neutral-600">{state.message}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy/90 focus:ring-2 focus:ring-navy focus:ring-offset-2 focus:outline-none"
            >
              Try Again
            </button>
            <Link
              href="/checkin"
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 focus:ring-2 focus:ring-navy focus:ring-offset-2 focus:outline-none"
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
            Check in to tell us what teams you&apos;re interested in!
          </p>
        </div>

        <CheckinForm token={token} meetingTitle={state.title} />
      </div>
    </main>
  );
}
