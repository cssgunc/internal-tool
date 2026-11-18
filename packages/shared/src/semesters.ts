import { z } from "zod";

export const SEMESTER_TERMS = ["fall", "spring"] as const;
export type SemesterTerm = (typeof SEMESTER_TERMS)[number];

export const semesterSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  term: z.enum(SEMESTER_TERMS),
  year: z.number().int(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  isCurrent: z.boolean(),
});

export const semesterListSchema = z.object({
  items: z.array(semesterSchema),
  total: z.number().int().nonnegative(),
});

const semesterDatesSchema = z
  .object({
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .refine((dates) => dates.startsOn < dates.endsOn, {
    message: "Start date must be before end date.",
    path: ["endsOn"],
  });

export const createSemesterSchema = semesterDatesSchema.safeExtend({
  term: z.enum(SEMESTER_TERMS),
  year: z.number().int().min(2000).max(2100),
});

export const updateSemesterDatesSchema = semesterDatesSchema;

export type Semester = z.infer<typeof semesterSchema>;
export type SemesterList = z.infer<typeof semesterListSchema>;
export type CreateSemesterInput = z.infer<typeof createSemesterSchema>;
export type UpdateSemesterDatesInput = z.infer<typeof updateSemesterDatesSchema>;
