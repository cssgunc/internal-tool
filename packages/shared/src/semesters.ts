import { z } from "zod";

export const SEMESTER_TERMS = ["fall", "spring"] as const;
export type SemesterTerm = (typeof SEMESTER_TERMS)[number];

// One semester as the API returns it. Dates are "YYYY-MM-DD" strings rather than
// timestamps, so they mean the same calendar day in every time zone.
export const semesterSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  term: z.enum(SEMESTER_TERMS),
  year: z.number().int(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  isCurrent: z.boolean(),
});

// GET /api/v1/semesters: newest semester first (TDD 3.2 Lists).
export const semesterListSchema = z.object({
  items: z.array(semesterSchema),
  total: z.number().int().nonnegative(),
});

export type Semester = z.infer<typeof semesterSchema>;
export type SemesterList = z.infer<typeof semesterListSchema>;
