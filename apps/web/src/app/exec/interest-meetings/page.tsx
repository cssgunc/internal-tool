"use client";

// TODO(auth): URL placement does not provide authorization; restrict meeting creation to exec and set created_by from session once auth is wired.

import { useState } from "react";
import { api } from "@/lib/api";

type CreatedMeeting = {
  id: string;
  checkinUrl: string;
  qrSvg: string;
  title: string;
  startsAt: string;
};

export default function InterestMeetingsPage() {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdMeeting, setCreatedMeeting] = useState<CreatedMeeting | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Please enter a meeting title.");
      return;
    }
    if (!startsAt) {
      setError("Please select a meeting start time.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Convert datetime-local to ISO string with timezone offset
      const isoDate = new Date(startsAt).toISOString();
      const res = await api.api.v1["interest-meetings"].$post({
        json: {
          title: title.trim(),
          startsAt: isoDate,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setCreatedMeeting({
          id: data.id,
          checkinUrl: data.checkinUrl,
          qrSvg: data.qrSvg,
          title: title.trim(),
          startsAt: isoDate,
        });
      } else {
        const errorData = await res.json();
        if ("error" in errorData) {
          setError(errorData.error.message || "Failed to create meeting.");
        } else {
          setError("Failed to create meeting.");
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!createdMeeting) return;
    try {
      await navigator.clipboard.writeText(createdMeeting.checkinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleReset = () => {
    setCreatedMeeting(null);
    setTitle("");
    setStartsAt("");
    setError(null);
  };

  if (createdMeeting) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-900 p-6 text-white md:p-12">
        <div className="flex w-full max-w-3xl flex-col items-center space-y-6 text-center">
          <div className="space-y-2">
            <span className="inline-block rounded-full bg-teal-500/20 px-4 py-1 text-sm font-semibold tracking-wide text-teal-300">
              Check-in Open
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-5xl">
              {createdMeeting.title}
            </h1>
            <p className="text-base text-neutral-400 md:text-lg">
              {new Date(createdMeeting.startsAt).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
          </div>

          {/* Large Projector-Ready QR Code */}
          <div
            className="flex aspect-square w-full max-w-xs items-center justify-center rounded-3xl bg-white p-6 shadow-2xl md:max-w-md [&>svg]:h-full [&>svg]:w-full"
            aria-label={`QR code for ${createdMeeting.title} check-in`}
            role="img"
            dangerouslySetInnerHTML={{ __html: createdMeeting.qrSvg }}
          />

          {/* Prominent Check-in URL for attendees */}
          <div className="w-full space-y-3">
            <p className="text-sm font-medium tracking-wider text-neutral-400 uppercase">
              Scan the QR code or go to
            </p>
            <div className="inline-flex max-w-full items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-800/80 px-5 py-3">
              <span className="font-mono text-lg font-bold break-all text-teal-300 select-all md:text-2xl">
                {createdMeeting.checkinUrl}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-lg bg-neutral-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-600"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div className="pt-6">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-5 py-2.5 text-sm font-medium text-neutral-300 transition hover:bg-neutral-700 hover:text-white"
            >
              Create Another Meeting
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-8">
          <p className="text-xs font-semibold tracking-wider text-teal-600 uppercase">
            Exec Portal
          </p>
          <h1 className="mt-1 text-3xl font-bold text-navy">Create Interest Meeting</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Set up an interest meeting to generate a projector-ready QR code and public check-in
            link.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm md:p-8"
        >
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="meeting-title" className="block text-sm font-medium text-neutral-800">
              Meeting Title <span className="text-red-500">*</span>
            </label>
            <input
              id="meeting-title"
              type="text"
              required
              placeholder="e.g. Fall 2026 Interest Meeting 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-base text-neutral-900 transition focus:border-navy focus:ring-1 focus:ring-navy focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="meeting-startsAt"
              className="block text-sm font-medium text-neutral-800"
            >
              Start Time <span className="text-red-500">*</span>
            </label>
            <input
              id="meeting-startsAt"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-base text-neutral-900 transition focus:border-navy focus:ring-1 focus:ring-navy focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-navy px-4 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-navy/90 focus:ring-2 focus:ring-navy focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creating Meeting..." : "Create Meeting & Show QR"}
          </button>
        </form>
      </div>
    </main>
  );
}
