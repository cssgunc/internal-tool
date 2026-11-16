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

export const fieldSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(FIELD_TYPES),
    label: z.string().min(1),
    required: z.boolean().default(false),
    // The values stored in answers. Promoted fields use the database enum's values.
    options: z.array(z.string()).optional(),
    // What applicants see for each option, e.g. { project: "Project Team" }.
    // Options without a label are shown as-is.
    optionLabels: z.record(z.string(), z.string()).optional(),
    maxLength: z.number().int().positive().optional(),
    maxWords: z.number().int().positive().optional(),
    // Number fields only.
    min: z.number().optional(),
    max: z.number().optional(),
    integer: z.boolean().optional(),
    promote: z.enum(PROMOTED_FIELDS).optional(),
  })
  .superRefine((field, ctx) => {
    for (const value of Object.keys(field.optionLabels ?? {})) {
      if (!field.options?.includes(value)) {
        ctx.addIssue({
          code: "custom",
          path: ["optionLabels", value],
          message: `"${value}" is not one of the field's options.`,
        });
      }
    }
  });

export const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  // Show this section only when another field's answer is one of these values.
  showIf: z.object({ field: z.string(), in: z.array(z.string()).min(1) }).optional(),
  fields: z.array(fieldSchema).min(1),
});

export const formDefinitionSchema = z
  .object({
    sections: z.array(sectionSchema).min(1),
  })
  // Answers are keyed by field id, so ids must be unique, and a section can only
  // depend on a field from an earlier section (one the applicant has already seen).
  .superRefine((form, ctx) => {
    const sectionIds = new Set<string>();
    const fieldIds = new Set<string>();
    form.sections.forEach((section, s) => {
      if (sectionIds.has(section.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", s, "id"],
          message: `Duplicate section id "${section.id}".`,
        });
      }
      sectionIds.add(section.id);

      if (section.showIf && !fieldIds.has(section.showIf.field)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", s, "showIf", "field"],
          message: `showIf refers to "${section.showIf.field}", which isn't a field in an earlier section.`,
        });
      }

      section.fields.forEach((field, f) => {
        if (fieldIds.has(field.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", s, "fields", f, "id"],
            message: `Duplicate field id "${field.id}".`,
          });
        }
        fieldIds.add(field.id);
      });
    });
  });

// Checks a definition and fills in defaults. Use it to write a definition in code,
// so a mistake fails as soon as the module loads.
export function defineForm(definition: z.input<typeof formDefinitionSchema>): FormDefinition {
  return formDefinitionSchema.parse(definition);
}

export type FormField = z.infer<typeof fieldSchema>;
export type FormSection = z.infer<typeof sectionSchema>;
export type FormDefinition = z.infer<typeof formDefinitionSchema>;
