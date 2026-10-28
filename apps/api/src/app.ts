import { Hono } from "hono";
import type { ApplyGlobalResponse } from "hono/client";
import type { ErrorResponse } from "@internal-tool/shared";
import { handleError, handleNotFound } from "./lib/errors";
import type { ApiErrorStatus } from "./lib/errors";
import { health } from "./routes/health";
import { createInterestMeetingRoutes, createPublicCheckinRoutes } from "./routes/interest-meetings";
import { createInterestMeetingService } from "./services/interest-meetings";
import type { InterestMeetingService } from "./services/interest-meetings";

// All API routes live under /api/v1 (TDD 3.2). Better Auth will mount its own
// routes under /api/auth when auth is added.
// Add each new resource as its own file in src/routes and chain it here.
// Tests create an isolated instance so test routes exercise the real error setup.
export function createApp({
  meetingService = createInterestMeetingService(),
}: { meetingService?: InterestMeetingService } = {}) {
  return new Hono()
    .onError(handleError)
    .notFound(handleNotFound)
    .basePath("/api/v1")
    .route("/health", health)
    .route("/interest-meetings", createInterestMeetingRoutes(meetingService))
    .route("/public/checkin", createPublicCheckinRoutes(meetingService));
}

export const app = createApp();

// Imported by apps/web for Hono's typed client (see apps/web/src/lib/api.ts).
// Hono does not infer onError responses automatically. Include the shared envelope
// for each supported error status while preserving each route's successful response.
export type AppType = ApplyGlobalResponse<
  typeof app,
  { [Status in ApiErrorStatus]: { json: ErrorResponse } }
>;
