import type { FormDefinition, FormSection } from "./definition";

export type ValidationErrors = Record<string, string>;

export interface ValidationResult {
  success: boolean;
  errors: ValidationErrors;
}

export function isSectionVisible(section: FormSection, answers: Record<string, unknown>): boolean {
  if (!section.showIf) {
    return true;
  }
  const answerVal = answers[section.showIf.field];
  return section.showIf.in.includes(answerVal as string);
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
        errors[field.id] = `${field.label} is required.`;
        continue;
      }

      if (!answered) {
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
