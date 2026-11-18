import { z } from "zod";

// GET /api/v1/me. The member record, derived access role, and current positions
// (TDD 3.2) get added once the members table exists.
export const meResponseSchema = z.object({
  id: z.string(), // Better Auth's user id (text, not a uuid)
  email: z.email(),
  name: z.string(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
