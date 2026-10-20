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
  const { field, in: allowedValues } = section.showIf;
  const currentAnswer = answers[field];

  if (typeof currentAnswer !== "string") {
    return false;
  }

  return allowedValues.includes(currentAnswer);
}

function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      const value = answers[field.id];
      const hasValue =
        value !== undefined &&
        value !== null &&
        (typeof value === "string" ? value.trim().length > 0 : true);
      // 1. Required check
      if (field.required && !hasValue) {
        errors[field.id] = `${field.label} is required.`;
        continue;
      }

      // If the field is empty and not required, skip further format checks
      if (!hasValue) {
        continue;
      }
      const stringValue = typeof value === "string" ? value : String(value);

      // 2. Email format check
      if (field.type === "email") {
        if (!EMAIL_REGEX.test(stringValue.trim())) {
          errors[field.id] = "Please enter a valid email address.";
        }
      }
      // 3. Select validation
      if (field.type === "select") {
        if (!field.options || !field.options.includes(stringValue)) {
          errors[field.id] = "Please select a valid option.";
        }
      }
      // 4. maxLength check
      if (field.maxLength !== undefined) {
        if (stringValue.length > field.maxLength) {
          errors[field.id] = `Cannot exceed ${field.maxLength} characters.`;
        }
      }

      // 5. maxWords check
      if (field.maxWords !== undefined) {
        const words = countWords(stringValue);
        if (words > field.maxWords) {
          errors[field.id] = `Cannot exceed ${field.maxWords} words.`;
        }
      }
    }
  }

  return {
    success: Object.keys(errors).length === 0,
    errors,
  };
}
