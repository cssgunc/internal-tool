import { and, eq, sql } from "drizzle-orm";
import type { SubmitInterestRequest, SubmitInterestResponse } from "@internal-tool/shared";
import type { db } from "../db";
import { interestCheckins, interestMeetings, semesters } from "../db/schema";
import { ApiError } from "../lib/errors";
import { didAttend, mergeCheckIns } from "./check-ins";

export type InterestCheckinWrite = Pick<
  typeof interestCheckins.$inferSelect,
  | "semesterId"
  | "meetingId"
  | "email"
  | "firstName"
  | "lastName"
  | "interests"
  | "attended"
  | "submittedAt"
>;

export interface InterestStore {
  currentSemesterId(): Promise<string | undefined>;
  meetingByToken(
    token: string
  ): Promise<
    Pick<typeof interestMeetings.$inferSelect, "id" | "semesterId" | "startsAt"> | undefined
  >;
  existingAttendance(semesterId: string, email: string): Promise<{ attended: boolean } | undefined>;
  upsertCheckin(values: InterestCheckinWrite): Promise<void>;
}

export function createInterestStore(database: Pick<typeof db, "select" | "insert">): InterestStore {
  return {
    async currentSemesterId() {
      const [semester] = await database
        .select({ id: semesters.id })
        .from(semesters)
        .where(eq(semesters.isCurrent, true))
        .limit(1);
      return semester?.id;
    },
    async meetingByToken(token) {
      const [meeting] = await database
        .select({
          id: interestMeetings.id,
          semesterId: interestMeetings.semesterId,
          startsAt: interestMeetings.startsAt,
        })
        .from(interestMeetings)
        .where(eq(interestMeetings.checkinToken, token))
        .limit(1);
      return meeting;
    },
    async existingAttendance(semesterId, email) {
      const [existing] = await database
        .select({ attended: interestCheckins.attended })
        .from(interestCheckins)
        .where(and(eq(interestCheckins.semesterId, semesterId), eq(interestCheckins.email, email)))
        .limit(1);
      return existing;
    },
    async upsertCheckin(values) {
      await database
        .insert(interestCheckins)
        .values(values)
        .onConflictDoUpdate({
          target: [interestCheckins.semesterId, interestCheckins.email],
          set: {
            meetingId: values.meetingId,
            email: values.email,
            firstName: values.firstName,
            lastName: values.lastName,
            interests: values.interests,
            submittedAt: values.submittedAt,
            // Keep attendance even if another request set it after our earlier read.
            attended: sql`${interestCheckins.attended} OR excluded.attended`,
            updatedAt: sql`now()`,
          },
        });
    },
  };
}

export function createInterestService(store?: InterestStore, now: () => Date = () => new Date()) {
  async function getStore() {
    if (store) return store;
    const { db } = await import("../db");
    return createInterestStore(db);
  }

  return {
    async submit(request: SubmitInterestRequest): Promise<SubmitInterestResponse> {
      const submittedAt = now();
      const repository = await getStore();
      const semesterId = await repository.currentSemesterId();
      if (!semesterId) throw new ApiError(409, "CONFLICT", "No semester is currently active.");

      let meetingId: string | null = null;
      let attended = false;
      if (request.token !== undefined) {
        const meeting = await repository.meetingByToken(request.token);
        if (!meeting || meeting.semesterId !== semesterId) {
          throw new ApiError(404, "NOT_FOUND", "Meeting not found for the current semester.");
        }
        meetingId = meeting.id;
        attended = didAttend(meeting.startsAt, submittedAt);
      }

      const incoming: InterestCheckinWrite = {
        semesterId,
        meetingId,
        email: request.email,
        firstName: request.firstName,
        lastName: request.lastName,
        interests: request.interests,
        attended,
        submittedAt,
      };
      const existing = await repository.existingAttendance(semesterId, request.email);
      const merged = mergeCheckIns(
        { ...incoming, attended: existing?.attended ?? false },
        incoming
      );
      await repository.upsertCheckin(merged);
      return { success: true };
    },
  };
}

export type InterestService = ReturnType<typeof createInterestService>;
