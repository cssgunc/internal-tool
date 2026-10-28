import {
  createInterestMeetingRequestSchema,
  createInterestMeetingResponseSchema,
  publicCheckinResponseSchema,
} from "@internal-tool/shared";
import { Hono } from "hono";
import { validate } from "../lib/validation";
import type { InterestMeetingService } from "../services/interest-meetings";

export function createInterestMeetingRoutes(service: InterestMeetingService) {
  // TODO(auth): restrict meeting creation to exec and set created_by from the session.
  return new Hono().post("/", validate("json", createInterestMeetingRequestSchema), async (c) => {
    const meeting = await service.createMeeting(c.req.valid("json"));
    return c.json(createInterestMeetingResponseSchema.parse(meeting), 201);
  });
}

export function createPublicCheckinRoutes(service: InterestMeetingService) {
  return new Hono().get("/:token", async (c) => {
    const meeting = await service.getPublicMeeting(c.req.param("token"));
    return c.json(publicCheckinResponseSchema.parse(meeting), 200);
  });
}
