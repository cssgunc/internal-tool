import { z } from "zod";

// Every form (applications, check-in, performance reviews) is data, not a
// hand-built page (TDD 3.3). One renderer draws any definition and one
// validator checks answers against it. The form builder stretch goal will edit
// these same definitions.

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "url",
  "number",
  "select",
  "multi_select",
  "checkbox",
  "rating",
] as const;

// Answers that get copied into real database columns for filtering.
export const PROMOTED_FIELDS = [
  "email",
  "first_name",
  "last_name",
  "track",
  "role_preference",
  "grad_year",
] as const;

export const fieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  maxLength: z.number().int().positive().optional(),
  maxWords: z.number().int().positive().optional(),
  promote: z.enum(PROMOTED_FIELDS).optional(),
});

export const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  // Show this section only when another field's answer is one of these values.
  showIf: z.object({ field: z.string(), in: z.array(z.string()).min(1) }).optional(),
  fields: z.array(fieldSchema).min(1),
});

export const formDefinitionSchema = z.object({
  sections: z.array(sectionSchema).min(1),
});

export type FormField = z.infer<typeof fieldSchema>;
export type FormSection = z.infer<typeof sectionSchema>;
export type FormDefinition = z.infer<typeof formDefinitionSchema>;
