import type { Metadata } from "next";
import { CheckinForm } from "@/components/CheckinForm";

export const metadata: Metadata = {
  title: "Join the Interested List | CSSG",
  description:
    "Join the CS + Social Good interested list to receive updates on recruiting, events, and workshops.",
};

export default function CheckinPage() {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-navy">Join the Interested List</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Tell us about yourself and what you&apos;d like to get involved with at CS + Social
            Good!
          </p>
        </div>

        <CheckinForm />
      </div>
    </main>
  );
}
