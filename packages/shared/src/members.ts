import { z } from "zod";
import { pageQuerySchema } from "./lists";

// Mirrors the database's member_status enum; shared code cannot import from apps/api.
export const MEMBER_STATUSES = ["active", "alumni"] as const;
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

export const memberListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(254).optional(),
  status: memberStatusSchema.optional(),
});
export const memberIdSchema = z.uuid();
export const memberIdParamsSchema = z.object({ id: memberIdSchema });

const nameSchema = z.string().trim().min(1).max(100);
const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((email) => email.toLowerCase());
export const githubUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(39)
  .regex(/^[a-z\d]+(?:-[a-z\d]+)*$/i, "Use letters, numbers, and single internal hyphens.");
const profileUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url({ protocol: /^https?$/ }));

// A fixed range supports historical alumni and future graduates without changing each year.
// There is no existing graduation-year range in the TDD or shared schemas.
export const MIN_GRAD_YEAR = 1900;
export const MAX_GRAD_YEAR = 2100;
export const gradYearSchema = z.number().int().min(MIN_GRAD_YEAR).max(MAX_GRAD_YEAR);

export const createMemberRequestSchema = z.strictObject({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  displayName: nameSchema.nullable().optional(),
  otherEmails: z.array(emailSchema).max(50).optional(),
  pronouns: z.string().trim().min(1).max(100).nullable().optional(),
  gradYear: gradYearSchema.nullable().optional(),
  majors: z.array(nameSchema).max(50).optional(),
  minors: z.array(nameSchema).max(50).optional(),
  githubUsername: githubUsernameSchema.nullable().optional(),
  linkedinUrl: profileUrlSchema.nullable().optional(),
  portfolioUrl: profileUrlSchema.nullable().optional(),
});

// TDD 2.2 Profile: future authorization must limit self-service edits to this allowlist.
export const SELF_EDITABLE_MEMBER_FIELDS = {
  displayName: true,
  pronouns: true,
  githubUsername: true,
  linkedinUrl: true,
  portfolioUrl: true,
  gradYear: true,
} as const;

export const updateMemberRequestSchema = createMemberRequestSchema
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update.",
  });
export const updateMemberProfileRequestSchema = createMemberRequestSchema
  .pick(SELF_EDITABLE_MEMBER_FIELDS)
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one profile field to update.",
  });

// Explicit response allowlist: parse before serialization to strip auth identifiers
// and any future database columns. Timestamps are JSON strings, not Date objects.
export const memberSchema = z.object({
  id: memberIdSchema,
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string().nullable(),
  email: z.email(),
  otherEmails: z.array(z.email()),
  pronouns: z.string().nullable(),
  gradYear: z.number().int().nullable(),
  majors: z.array(z.string()),
  minors: z.array(z.string()),
  githubUsername: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  isSuperuser: z.boolean(),
  status: memberStatusSchema,
  invitedAt: z.iso.datetime({ offset: true }).nullable(),
  activatedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const memberListSchema = z.object({
  items: z.array(memberSchema),
  total: z.number().int().nonnegative(),
});

export type MemberListQuery = z.output<typeof memberListQuerySchema>;
export type MemberIdParams = z.infer<typeof memberIdParamsSchema>;
export type CreateMemberRequest = z.infer<typeof createMemberRequestSchema>;
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;
export type UpdateMemberProfileRequest = z.infer<typeof updateMemberProfileRequestSchema>;
export type Member = z.infer<typeof memberSchema>;
export type MemberList = z.infer<typeof memberListSchema>;
