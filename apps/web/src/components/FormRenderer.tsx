"use client";

import React, { useState } from "react";
import {
  filterVisibleAnswers,
  isSectionVisible,
  validateAnswers,
  type FormDefinition,
  type FormField,
  type ValidationErrors,
} from "@internal-tool/shared";

interface FormRendererProps {
  definition: FormDefinition;
  onSubmitSuccess?: (answers: Record<string, unknown>) => void;
}

const SUPPORTED_TYPES = new Set(["short_text", "long_text", "email", "select"]);

export function FormRenderer({ definition, onSubmitSuccess }: FormRendererProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submittedPayload, setSubmittedPayload] = useState<Record<string, unknown> | null>(null);

  const handleFieldChange = (fieldId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));

    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateAnswers(definition, answers);

    if (!result.success) {
      setErrors(result.errors);
      setSubmittedPayload(null);
    } else {
      setErrors({});
      const cleanedAnswers = filterVisibleAnswers(definition, answers);
      setSubmittedPayload(cleanedAnswers);
      if (onSubmitSuccess) {
        onSubmitSuccess(cleanedAnswers);
      }
    }
  };

  const renderFieldInput = (field: FormField) => {
    if (!SUPPORTED_TYPES.has(field.type)) {
      return (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          Field type &ldquo;{field.type}&rdquo; is not supported yet.
        </div>
      );
    }

    const value = (answers[field.id] as string) ?? "";
    const hasError = Boolean(errors[field.id]);
    const errorId = `${field.id}-error`;
    const baseClasses =
      "mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none";
    const statusClasses = hasError
      ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500"
      : "border-gray-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600";

    const commonProps = {
      id: field.id,
      name: field.id,
      required: field.required,
      "aria-required": field.required,
      "aria-invalid": hasError,
      "aria-describedby": hasError ? errorId : undefined,
      className: `${baseClasses} ${statusClasses}`,
    };

    if (field.type === "short_text" || field.type === "email") {
      return (
        <input
          {...commonProps}
          type={field.type === "email" ? "email" : "text"}
          value={value}
          onChange={(e) => handleFieldChange(field.id, e.target.value)}
        />
      );
    }

    if (field.type === "long_text") {
      return (
        <textarea
          {...commonProps}
          rows={4}
          value={value}
          onChange={(e) => handleFieldChange(field.id, e.target.value)}
        />
      );
    }

    if (field.type === "select") {
      return (
        <select
          {...commonProps}
          value={value}
          onChange={(e) => handleFieldChange(field.id, e.target.value)}
        >
          <option value="">Select an option</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    return null;
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {definition.sections.map((section) => {
        if (!isSectionVisible(section, answers)) {
          return null;
        }

        return (
          <fieldset
            key={section.id}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
          >
            <legend className="px-2 text-base font-semibold text-gray-900">{section.title}</legend>
            <div className="mt-4 space-y-4">
              {section.fields.map((field) => {
                const errorId = `${field.id}-error`;
                return (
                  <div key={field.id}>
                    <label htmlFor={field.id} className="block text-sm font-medium text-gray-700">
                      {field.label}
                      {field.required && (
                        <span className="ml-1 text-red-500" aria-hidden="true">
                          *
                        </span>
                      )}
                    </label>
                    {renderFieldInput(field)}
                    {errors[field.id] && (
                      <p id={errorId} className="mt-1 text-xs text-red-600" role="alert">
                        {errors[field.id]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <button
        type="submit"
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
      >
        Submit Answers
      </button>

      {submittedPayload && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <h4 className="text-sm font-semibold text-emerald-900">Validated Answers Payload</h4>
          <pre className="mt-2 overflow-x-auto text-xs text-emerald-800">
            {JSON.stringify(submittedPayload, null, 2)}
          </pre>
        </div>
      )}
    </form>
  );
}
