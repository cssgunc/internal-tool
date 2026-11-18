import type { FormDefinition, FormSection } from "./definition";

export type ValidationErrors = Record<string, string>;

export interface ValidationResult {
  success: boolean;
  errors: ValidationErrors;
}

// A section shows when the answer it depends on is one of its showIf values. For a
// multi_select, it shows when any chosen value is one of them.
export function isSectionVisible(section: FormSection, answers: Record<string, unknown>): boolean {
  if (!section.showIf) {
    return true;
  }
  const { in: values } = section.showIf;
  const answerVal = answers[section.showIf.field];
  if (Array.isArray(answerVal)) {
    return answerVal.some((value) => values.includes(value as string));
  }
  return values.includes(answerVal as string);
}

// Field types whose answer is a single string.
const TEXT_TYPES = new Set(["short_text", "long_text", "email", "url", "select"]);

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasValue(val: unknown): boolean {
  if (val === undefined || val === null) {
    return false;
  }
  if (typeof val === "string") {
    return val.trim().length > 0;
  }
  if (Array.isArray(val)) {
    return val.length > 0;
  }
  return true;
}

export function filterVisibleAnswers(
  definition: FormDefinition,
  answers: Record<string, unknown>
): Record<string, unknown> {
  const visibleAnswers: Record<string, unknown> = {};

  for (const section of definition.sections) {
    if (!isSectionVisible(section, answers)) {
      continue;
    }
    for (const field of section.fields) {
      if (field.id in answers && hasValue(answers[field.id])) {
        visibleAnswers[field.id] = answers[field.id];
      }
    }
  }

  return visibleAnswers;
}

export function validateAnswers(
  definition: FormDefinition,
  answers: Record<string, unknown>
): ValidationResult {
  const errors: ValidationErrors = {};

  for (const section of definition.sections) {
    if (!isSectionVisible(section, answers)) {
      continue;
    }

    for (const field of section.fields) {
      const val = answers[field.id];
      const answered = hasValue(val);

      if (field.required && !answered) {
        // Shown under the question itself, so it doesn't repeat the label.
        errors[field.id] = "Required.";
        continue;
      }

      if (!answered) {
        continue;
      }

      // Answers end up in a JSON column, so reject the wrong shape outright.
      if (TEXT_TYPES.has(field.type) && typeof val !== "string") {
        errors[field.id] = "Invalid answer.";
        continue;
      }

      if (field.type === "checkbox" && typeof val !== "boolean") {
        errors[field.id] = "Invalid answer.";
        continue;
      }

      if (field.type === "number" || field.type === "rating") {
        if (typeof val !== "number" || !Number.isFinite(val)) {
          errors[field.id] = "Please enter a number.";
          continue;
        }
        if (field.integer && !Number.isInteger(val)) {
          errors[field.id] = "Please enter a whole number.";
          continue;
        }
        if (field.min !== undefined && val < field.min) {
          errors[field.id] = `Must be at least ${field.min}.`;
          continue;
        }
        if (field.max !== undefined && val > field.max) {
          errors[field.id] = `Must be at most ${field.max}.`;
          continue;
        }
      }

      if (field.type === "multi_select") {
        if (!Array.isArray(val) || !val.every((item) => typeof item === "string")) {
          errors[field.id] = "Invalid answer.";
          continue;
        }
        if (field.options && !val.every((item) => field.options?.includes(item))) {
          errors[field.id] = "Please select only valid options.";
          continue;
        }
        // Without repeats, an answer can't be longer than the list of options.
        if (new Set(val).size !== val.length) {
          errors[field.id] = "Please select each option only once.";
          continue;
        }
      }

      if (field.type === "url" && typeof val === "string" && !isWebUrl(val)) {
        errors[field.id] = "Please enter a full link, starting with https://.";
        continue;
      }

      if (field.type === "email" && typeof val === "string") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(val.trim())) {
          errors[field.id] = "Please enter a valid email address.";
          continue;
        }
      }

      if (field.type === "select" && field.options) {
        if (!field.options.includes(val as string)) {
          errors[field.id] = "Please select a valid option.";
          continue;
        }
      }

      if (typeof val === "string") {
        if (field.maxLength !== undefined && val.length > field.maxLength) {
          errors[field.id] = `Cannot exceed ${field.maxLength} characters.`;
          continue;
        }

        if (field.maxWords !== undefined) {
          const wordCount = val.trim().split(/\s+/).filter(Boolean).length;
          if (wordCount > field.maxWords) {
            errors[field.id] = `Cannot exceed ${field.maxWords} words.`;
            continue;
          }
        }
      }
    }
  }

  return {
    success: Object.keys(errors).length === 0,
    errors,
  };
}
