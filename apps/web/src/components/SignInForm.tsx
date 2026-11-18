"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSafeRedirectPath } from "@internal-tool/shared";

interface SignInFormProps {
  onSuccess?: (destination: string) => void;
}

export function SignInForm({ onSuccess }: SignInFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isLoading) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const nextParam = searchParams.get("next");
        const safePath = getSafeRedirectPath(nextParam, "/");
        // Avoid redirecting back to /sign-in (including subpaths, queries, or fragments)
        const isSignInTarget =
          safePath === "/sign-in" ||
          safePath.startsWith("/sign-in/") ||
          safePath.startsWith("/sign-in?") ||
          safePath.startsWith("/sign-in#");
        const destination = isSignInTarget ? "/" : safePath;

        if (onSuccess) {
          onSuccess(destination);
        } else {
          router.push(destination);
          router.refresh();
        }
      } else if (res.status === 400 || res.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
          Email address
        </label>
        <div className="mt-1">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isLoading}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-navy focus:ring-1 focus:ring-navy focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500 sm:text-sm"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
          Password
        </label>
        <div className="mt-1">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isLoading}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-navy focus:ring-1 focus:ring-navy focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500 sm:text-sm"
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full justify-center rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy/90 focus:ring-2 focus:ring-navy focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </form>
  );
}
