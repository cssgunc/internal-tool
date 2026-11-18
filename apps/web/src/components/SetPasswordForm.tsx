"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface SetPasswordFormProps {
  onSuccess?: () => void;
}

export function SetPasswordForm({ onSuccess }: SetPasswordFormProps) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // If token is missing from the URL, show an immediate informative error and link to sign in
  if (!token) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
      >
        <p className="font-semibold">Missing setup token</p>
        <p className="mt-1">
          A valid setup token is required to set your password. Please use the link provided in your
          invitation or password reset email.
        </p>
        <div className="mt-4">
          <Link
            href="/sign-in"
            className="text-sm font-semibold text-navy hover:underline focus:outline-none"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  // After successful password setup, show confirmation and a link to sign-in
  if (isSuccess) {
    return (
      <div
        role="status"
        className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
      >
        <p className="font-semibold">Password set successfully</p>
        <p className="mt-1">
          Your password has been updated. You can now sign in using your email and new password.
        </p>
        <div className="mt-4">
          <Link
            href="/sign-in"
            className="inline-flex justify-center rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-navy/90 focus:ring-2 focus:ring-navy focus:ring-offset-2 focus:outline-none"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isLoading) {
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          newPassword,
          token,
        }),
      });

      if (res.ok) {
        setIsSuccess(true);
        if (onSuccess) {
          onSuccess();
        }
      } else if (res.status === 400 || res.status === 401 || res.status === 422) {
        let errorMsg = "Invalid, expired, or already-used token. Please request a new setup link.";
        try {
          const data = (await res.json()) as { code?: string };
          if (data.code === "PASSWORD_TOO_SHORT" || data.code === "PASSWORD_TOO_LONG") {
            errorMsg = "Password must be at least 8 characters long.";
          } else if (data.code === "INVALID_TOKEN" || data.code === "TOKEN_EXPIRED") {
            errorMsg = "Invalid, expired, or already-used token. Please request a new setup link.";
          }
        } catch {
          // fallback to controlled token error
        }
        setError(errorMsg);
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
        <label htmlFor="new-password" className="block text-sm font-medium text-neutral-700">
          New password
        </label>
        <div className="mt-1">
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={isLoading}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="block w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-navy focus:ring-1 focus:ring-navy focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500 sm:text-sm"
          />
        </div>
        <p className="mt-1 text-xs text-neutral-500">Must be at least 8 characters long.</p>
      </div>

      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-neutral-700">
          Confirm password
        </label>
        <div className="mt-1">
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={isLoading}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {isLoading ? "Setting password..." : "Set password"}
        </button>
      </div>
    </form>
  );
}
