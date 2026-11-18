import { z } from "zod";
import { DEV_SUBROLES, PROJECT_STATUSES } from "./enums";

const projectFields = {
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().nullable(),
  notionUrl: z.url().nullable(),
};

export const projectSchema = z.object({
  id: z.uuid(),
  semesterId: z.uuid(),
  ...projectFields,
  status: z.enum(PROJECT_STATUSES),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Project = z.infer<typeof projectSchema>;
export const projectListResponseSchema = z.array(projectSchema);

export const projectListQuerySchema = z.object({
  semesterId: z.uuid().optional(),
});
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export const createProjectRequestSchema = z.object({
  semesterId: z.uuid(),
  name: projectFields.name,
  slug: projectFields.slug,
  description: projectFields.description.optional(),
  notionUrl: projectFields.notionUrl.optional(),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const patchProjectRequestSchema = z
  .object({
    name: projectFields.name.optional(),
    slug: projectFields.slug.optional(),
    description: projectFields.description.optional(),
    notionUrl: projectFields.notionUrl.optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export type PatchProjectRequest = z.infer<typeof patchProjectRequestSchema>;

export const deleteProjectResponseSchema = z.object({
  id: z.uuid(),
  archived: z.boolean(),
});
export type DeleteProjectResponse = z.infer<typeof deleteProjectResponseSchema>;

export const assignPositionRequestSchema = z.object({
  positionId: z.uuid(),
  semesterId: z.uuid(),
  projectId: z.uuid().optional(),
  devSubrole: z.enum(DEV_SUBROLES).optional(),
});
export type AssignPositionRequest = z.infer<typeof assignPositionRequestSchema>;

export const memberPositionSchema = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  positionId: z.uuid(),
  semesterId: z.uuid(),
  projectId: z.uuid().nullable(),
  devSubrole: z.enum(DEV_SUBROLES).nullable(),
  assignedBy: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type MemberPosition = z.infer<typeof memberPositionSchema>;

export const deleteMemberPositionResponseSchema = z.object({
  id: z.uuid(),
  removed: z.literal(true),
});
export type DeleteMemberPositionResponse = z.infer<typeof deleteMemberPositionResponseSchema>;
