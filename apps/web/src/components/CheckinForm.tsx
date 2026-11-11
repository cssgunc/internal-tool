"use client";

import { useRef, useState } from "react";
import { INTEREST_KINDS, type InterestKind } from "@internal-tool/shared";
import { api } from "@/lib/api";
import { Turnstile, type TurnstileRef } from "./Turnstile";

interface CheckinFormProps {
  token?: string;
  meetingTitle?: string;
}

const INTEREST_LABELS: Record<InterestKind, { label: string; description: string }> = {
  project: {
    label: "Project Teams",
    description: "Build software solutions for non-profits and community partners.",
  },
  education: {
    label: "Education Program",
    description: "Learn web and software development through guided curriculum and workshops.",
  },
  exec: {
    label: "Executive Team",
    description: "Help organize, manage, and lead club operations, outreach, and events.",
  },
};

export function CheckinForm({ token, meetingTitle }: CheckinFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<InterestKind[]>([]);
  const [website, setWebsite] = useState(""); // Honeypot field
  const [turnstileToken, setTurnstileToken] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const turnstileRef = useRef<TurnstileRef>(null);

  const invalidateToken = (errorMessage?: string) => {
    setTurnstileToken("");
    turnstileRef.current?.reset();
    if (errorMessage) {
      setFieldErrors((prev) => ({
        ...prev,
        turnstileToken: errorMessage,
      }));
    }
  };

  const toggleInterest = (kind: InterestKind) => {
    setInterests((prev) =>
      prev.includes(kind) ? prev.filter((item) => item !== kind) : [...prev, kind]
    );
    if (fieldErrors.interests) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.interests;
        return next;
      });
    }
  };

  const handleInputChange = (field: string, setter: (val: string) => void, val: string) => {
    setter(val);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});

    // Client-side quick check
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = "First name is required.";
    if (!lastName.trim()) errors.lastName = "Last name is required.";
    if (!email.trim()) errors.email = "Email is required.";
    if (interests.length === 0) errors.interests = "Please select at least one interest.";
    if (!turnstileToken) errors.turnstileToken = "Please complete the verification.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.api.v1.public.interest.$post({
        json: {
          token: token || undefined,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          interests,
          website, // honeypot
          turnstileToken,
        },
      });

      if (res.ok) {
        setIsSuccess(true);
      } else {
        invalidateToken();
        if (res.status === 429) {
          setGeneralError("Too many attempts. Please wait a moment before trying again.");
        } else {
          try {
            const data = await res.json();
            if ("error" in data) {
              if (data.error.fields) {
                setFieldErrors(data.error.fields as Record<string, string>);
              }
              if (data.error.message && !data.error.fields) {
                setGeneralError(data.error.message);
              }
            } else {
              setGeneralError("An unexpected error occurred. Please try again.");
            }
          } catch {
            setGeneralError("An unexpected error occurred. Please try again.");
          }
        }
      }
    } catch {
      invalidateToken();
      setGeneralError(
        "Could not submit check-in. Please check your internet connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm md:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal/20 text-navy">
          <svg
            className="h-8 w-8 text-teal-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-navy">
          {meetingTitle ? "Check-in Submitted" : "You're on the List!"}
        </h2>
        <p className="mt-2 text-neutral-600">
          {meetingTitle
            ? "Your check-in was submitted successfully."
            : "Thanks for joining the CSSG Interested list. We'll be in touch with updates!"}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm md:p-8"
    >
      {generalError && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {generalError}
        </div>
      )}

      <div className="space-y-4">
        {/* First & Last Name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-neutral-800">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              id="firstName"
              type="text"
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => handleInputChange("firstName", setFirstName, e.target.value)}
              aria-invalid={Boolean(fieldErrors.firstName)}
              aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
              className={`mt-1 block w-full rounded-lg border px-3.5 py-2.5 text-base text-neutral-900 transition-colors focus:outline-none ${
                fieldErrors.firstName
                  ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  : "border-neutral-300 focus:border-navy focus:ring-1 focus:ring-navy"
              }`}
            />
            {fieldErrors.firstName && (
              <p id="firstName-error" role="alert" className="mt-1 text-xs text-red-600">
                {fieldErrors.firstName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-neutral-800">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              id="lastName"
              type="text"
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => handleInputChange("lastName", setLastName, e.target.value)}
              aria-invalid={Boolean(fieldErrors.lastName)}
              aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
              className={`mt-1 block w-full rounded-lg border px-3.5 py-2.5 text-base text-neutral-900 transition-colors focus:outline-none ${
                fieldErrors.lastName
                  ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  : "border-neutral-300 focus:border-navy focus:ring-1 focus:ring-navy"
              }`}
            />
            {fieldErrors.lastName && (
              <p id="lastName-error" role="alert" className="mt-1 text-xs text-red-600">
                {fieldErrors.lastName}
              </p>
            )}
          </div>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-800">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => handleInputChange("email", setEmail, e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            className={`mt-1 block w-full rounded-lg border px-3.5 py-2.5 text-base text-neutral-900 transition-colors focus:outline-none ${
              fieldErrors.email
                ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                : "border-neutral-300 focus:border-navy focus:ring-1 focus:ring-navy"
            }`}
          />
          {fieldErrors.email && (
            <p id="email-error" role="alert" className="mt-1 text-xs text-red-600">
              {fieldErrors.email}
            </p>
          )}
        </div>

        {/* Honeypot Field - Hidden from users and assistive technology */}
        <div aria-hidden="true" style={{ display: "none" }} tabIndex={-1}>
          <label htmlFor="website">Website (leave blank)</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {/* Interests Selection */}
        <div className="pt-2">
          <fieldset>
            <legend className="block text-sm font-medium text-neutral-800">
              Areas of Interest <span className="text-red-500">*</span>
            </legend>
            <p className="mt-0.5 text-xs text-neutral-500">Select all that apply.</p>

            <div className="mt-3 space-y-2.5">
              {INTEREST_KINDS.map((kind) => {
                const info = INTEREST_LABELS[kind];
                const checked = interests.includes(kind);
                return (
                  <label
                    key={kind}
                    htmlFor={`interest-${kind}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      checked ? "border-navy bg-sky/15" : "border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    <input
                      id={`interest-${kind}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInterest(kind)}
                      className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-navy focus:ring-navy"
                    />
                    <div className="text-sm">
                      <div className="font-medium text-neutral-900">{info.label}</div>
                      <div className="mt-0.5 text-xs text-neutral-500">{info.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            {fieldErrors.interests && (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {fieldErrors.interests}
              </p>
            )}
          </fieldset>
        </div>

        {/* Turnstile Widget */}
        <div className="pt-2">
          <Turnstile
            ref={turnstileRef}
            onSuccess={(token) => {
              setTurnstileToken(token);
              if (fieldErrors.turnstileToken) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.turnstileToken;
                  return next;
                });
              }
            }}
            onError={() => invalidateToken("Verification check failed. Please retry.")}
            onExpire={() => invalidateToken("Verification expired. Please verify again.")}
          />
          {fieldErrors.turnstileToken && (
            <p role="alert" className="text-center text-xs text-red-600">
              {fieldErrors.turnstileToken}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !turnstileToken}
          className="w-full rounded-lg bg-navy px-4 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-navy/90 focus:ring-2 focus:ring-navy focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Submitting..." : meetingTitle ? "Check In" : "Join List"}
        </button>
      </div>
    </form>
  );
}
