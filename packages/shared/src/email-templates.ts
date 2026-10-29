import { z } from "zod";

export const EMAIL_KINDS = [
  "invite",
  "password_reset",
  "applications_open",
  "closing_reminder",
  "exec_rejection",
  "returner_congrats",
  "education_congrats",
  "rejection",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

export const emailKindSchema = z.enum(EMAIL_KINDS);

export const ALLOWED_PLACEHOLDERS: Record<EmailKind, readonly string[]> = {
  invite: ["firstName", "siteUrl", "inviteToken"],
  password_reset: ["firstName", "resetUrl"],
  applications_open: ["firstName", "siteUrl", "closingDate"],
  closing_reminder: ["firstName", "siteUrl", "closingDate"],
  exec_rejection: ["firstName"],
  returner_congrats: ["firstName", "projectName", "siteUrl"],
  education_congrats: ["firstName", "siteUrl"],
  rejection: ["firstName"],
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
  allowedKeys?: readonly string[]
): { rendered: string; errors: string[] } {
  const errors: string[] = [];

  const rendered = template.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();

    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      errors.push(`Invalid placeholder: ${match}`);
      return match;
    }

    if (allowedKeys && !allowedKeys.includes(key)) {
      errors.push(`Disallowed placeholder: {{${key}}}`);
      return match;
    }

    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      errors.push(`Missing variable: {{${key}}}`);
      return match;
    }

    return escapeHtml(vars[key] ?? "");
  });

  return { rendered, errors };
}

export function extractPlaceholders(text: string): string[] {
  const matches = text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g);

  const placeholders = Array.from(matches, (match) => match[1]!.trim());

  return [...new Set(placeholders)];
}

export function findDisallowedPlaceholders(
  kind: EmailKind,
  subject: string,
  body: string
): string[] {
  const allowed = ALLOWED_PLACEHOLDERS[kind];

  const placeholders = [...extractPlaceholders(subject), ...extractPlaceholders(body)];

  return [...new Set(placeholders)].filter((placeholder) => !allowed.includes(placeholder));
}

export const updateEmailTemplateSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required"),
  body: z.string().trim().min(1, "Body is required"),
});
