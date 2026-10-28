import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type {
  CreateInterestMeetingRequest,
  CreateInterestMeetingResponse,
  PublicCheckinResponse,
} from "@internal-tool/shared";
import type { db } from "../db";
import { interestMeetings, semesters } from "../db/schema";
import { env } from "../env";
import { ApiError } from "../lib/errors";

export interface InterestMeetingStore {
  currentSemesterId(): Promise<string | undefined>;
  insertMeeting(values: typeof interestMeetings.$inferInsert): Promise<{ id: string }>;
  titleByToken(token: string): Promise<PublicCheckinResponse | undefined>;
}

// A transaction can supply the same select/insert operations as the normal database.
export function createInterestMeetingStore(
  database: Pick<typeof db, "select" | "insert">
): InterestMeetingStore {
  return {
    async currentSemesterId() {
      const [semester] = await database
        .select({ id: semesters.id })
        .from(semesters)
        .where(eq(semesters.isCurrent, true))
        .limit(1);
      return semester?.id;
    },
    async insertMeeting(values) {
      const [meeting] = await database
        .insert(interestMeetings)
        .values(values)
        .returning({ id: interestMeetings.id });
      if (!meeting) throw new Error("Meeting insert returned no row.");
      return meeting;
    },
    async titleByToken(token) {
      const [meeting] = await database
        .select({ title: interestMeetings.title })
        .from(interestMeetings)
        .where(eq(interestMeetings.checkinToken, token))
        .limit(1);
      return meeting;
    },
  };
}

export function createInterestMeetingService(
  store?: InterestMeetingStore,
  webUrl: string = env.WEB_URL
) {
  async function getStore() {
    // Load the connection only when needed, so health checks and tests can run without Postgres.
    if (store) return store;
    const { db } = await import("../db");
    return createInterestMeetingStore(db);
  }

  return {
    async createMeeting(
      request: CreateInterestMeetingRequest
    ): Promise<CreateInterestMeetingResponse> {
      const repository = await getStore();
      const semesterId = await repository.currentSemesterId();
      if (!semesterId) {
        throw new ApiError(409, "CONFLICT", "No semester is currently active.");
      }

      // 32 random bytes give the public link a 256-bit token, encoded as URL-safe hex.
      const checkinToken = randomBytes(32).toString("hex");
      const { id } = await repository.insertMeeting({
        semesterId,
        title: request.title,
        startsAt: new Date(request.startsAt),
        checkinToken,
      });
      return { id, checkinUrl: new URL(`/checkin/${checkinToken}`, webUrl).toString() };
    },

    async getPublicMeeting(token: string): Promise<PublicCheckinResponse> {
      const repository = await getStore();
      const meeting = await repository.titleByToken(token);
      if (!meeting) throw new ApiError(404, "NOT_FOUND", "Meeting not found.");
      return { title: meeting.title };
    },
  };
}

export type InterestMeetingService = ReturnType<typeof createInterestMeetingService>;
