import { Hono } from "hono";
import type { ApplyGlobalResponse } from "hono/client";
import type { ErrorResponse } from "@internal-tool/shared";
import { handleError, handleNotFound } from "./lib/errors";
import type { ApiErrorStatus } from "./lib/errors";
import { sessionMiddleware } from "./lib/session";
import type { AppEnv } from "./lib/session";
import { authRoutes } from "./routes/auth";
import { health } from "./routes/health";
import { me } from "./routes/me";
import { members } from "./routes/members";
import { semesters } from "./routes/semesters";
import { createInterestMeetingRoutes, createPublicCheckinRoutes } from "./routes/interest-meetings";
import { createInterestMeetingService } from "./services/interest-meetings";
import type { InterestMeetingService } from "./services/interest-meetings";
import { createPublicInterestRoutes } from "./routes/public-interest";
import { createInterestService } from "./services/interest";
import type { InterestService } from "./services/interest";

// All API routes live under /api/v1 (TDD 3.2). Better Auth mounts its own routes
// under /api/auth. Every /api/v1 route gets the signed-in user (or null) from
// sessionMiddleware.
// Add each new resource as its own file in src/routes and chain it here.
// Tests create an isolated instance so test routes exercise the real error setup.
export function createApp({
  meetingService = createInterestMeetingService(),
  interestService = createInterestService(),
}: { meetingService?: InterestMeetingService; interestService?: InterestService } = {}) {
  return new Hono<AppEnv>()
    .onError(handleError)
    .notFound(handleNotFound)
    .route("/api/auth", authRoutes)
    .basePath("/api/v1")
    .use(sessionMiddleware)
    .route("/health", health)
    .route("/semesters", semesters)
    .route("/me", me)
    .route("/members", members)
    .route("/interest-meetings", createInterestMeetingRoutes(meetingService))
    .route("/public/checkin", createPublicCheckinRoutes(meetingService))
    .route("/public/interest", createPublicInterestRoutes(interestService));
}

export const app = createApp();

// Imported by apps/web for Hono's typed client (see apps/web/src/lib/api.ts).
// Hono does not infer onError responses automatically. Include the shared envelope
// for each supported error status while preserving each route's successful response.
export type AppType = ApplyGlobalResponse<
  typeof app,
  { [Status in ApiErrorStatus]: { json: ErrorResponse } }
>;
