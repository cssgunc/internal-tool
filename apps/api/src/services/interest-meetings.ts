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
import { diffChanges, recordAudit } from "./audit";
import type { AuditActor, AuditEntry } from "./audit";

export interface InterestMeetingStore {
  currentSemesterId(): Promise<string | undefined>;
  insertMeeting(values: typeof interestMeetings.$inferInsert): Promise<{ id: string }>;
  titleByToken(token: string): Promise<PublicCheckinResponse | undefined>;
  recordAudit(entry: AuditEntry): Promise<void>;
  // Runs work in one database transaction, with a store whose operations use it.
  transaction<T>(work: (store: InterestMeetingStore) => Promise<T>): Promise<T>;
}

// A transaction can supply the same select/insert operations as the normal database.
export function createInterestMeetingStore(
  database: Pick<typeof db, "select" | "insert" | "transaction">
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
    async recordAudit(entry) {
      await recordAudit(entry, database);
    },
    transaction(work) {
      return database.transaction((tx) => work(createInterestMeetingStore(tx)));
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
    // Without an actor, the audit entry is logged as System. TODO(auth): the route
    // passes the signed-in member once sessions are linked to members.
    async createMeeting(
      request: CreateInterestMeetingRequest,
      actor?: AuditActor | null
    ): Promise<CreateInterestMeetingResponse> {
      const repository = await getStore();
      // The meeting and its audit entry are saved together or not at all.
      return repository.transaction(async (store) => {
        const semesterId = await store.currentSemesterId();
        if (!semesterId) {
          throw new ApiError(409, "CONFLICT", "No semester is currently active.");
        }

        const meeting = { semesterId, title: request.title, startsAt: new Date(request.startsAt) };
        // 32 random bytes give the public link a 256-bit token, encoded as URL-safe hex.
        const checkinToken = randomBytes(32).toString("hex");
        const { id } = await store.insertMeeting({ ...meeting, checkinToken });
        await store.recordAudit({
          actor,
          action: "interest_meeting.create",
          targetType: "interest_meeting",
          targetId: id,
          // The check-in token stays out: it's the secret in the public link.
          changes: diffChanges(null, meeting),
        });
        return { id, checkinUrl: new URL(`/checkin/${checkinToken}`, webUrl).toString() };
      });
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
