import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/SignInForm";

export const metadata: Metadata = {
  title: "Sign In | CSSG Internal Tool",
  description: "Sign in to the CSSG Internal Tool",
};

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col justify-center bg-neutral-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-3xl font-bold tracking-tight text-navy">
          CSSG Internal Tool
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-600">Sign in to your account</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="border border-neutral-200 bg-white px-4 py-8 shadow-sm sm:rounded-xl sm:px-10">
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                className="py-4 text-center text-sm text-neutral-500"
              >
                Loading...
              </div>
            }
          >
            <SignInForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
