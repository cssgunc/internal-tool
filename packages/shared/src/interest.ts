import { z } from "zod";
import { INTEREST_KINDS } from "./enums";

export const interestKindSchema = z.enum(INTEREST_KINDS);

export const createInterestMeetingRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.iso.datetime({ offset: true }),
});

export const createInterestMeetingResponseSchema = z.object({
  id: z.uuid(),
  checkinUrl: z.url(),
});

// Public lookup deliberately excludes the token, start time, and attendance data.
export const publicCheckinResponseSchema = z.object({
  title: z.string(),
});

export const submitInterestRequestSchema = z.object({
  token: z.string().min(1).max(128).optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .transform((email) => email.toLowerCase()),
  interests: z.array(interestKindSchema).min(1).max(INTEREST_KINDS.length),
  website: z.string().max(2048).default(""),
  // Verification belongs to the separate Public-route protection ticket.
  turnstileToken: z.string().max(2048).optional(),
});

// No identifying data is needed, so a honeypot submission can return the same response.
export const submitInterestResponseSchema = z.object({ success: z.literal(true) });

export type CreateInterestMeetingRequest = z.infer<typeof createInterestMeetingRequestSchema>;
export type CreateInterestMeetingResponse = z.infer<typeof createInterestMeetingResponseSchema>;
export type PublicCheckinResponse = z.infer<typeof publicCheckinResponseSchema>;
export type SubmitInterestRequest = z.infer<typeof submitInterestRequestSchema>;
export type SubmitInterestResponse = z.infer<typeof submitInterestResponseSchema>;
