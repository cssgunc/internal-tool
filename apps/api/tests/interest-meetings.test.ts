import { describe, expect, expectTypeOf, it } from "bun:test";
import {
  createInterestMeetingResponseSchema,
  errorResponseSchema,
  publicCheckinResponseSchema,
} from "@internal-tool/shared";
import type {
  CreateInterestMeetingRequest,
  CreateInterestMeetingResponse,
  ErrorResponse,
  PublicCheckinResponse,
} from "@internal-tool/shared";
import { hc } from "hono/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { api as webApi } from "../../web/src/lib/api";
import { createApp } from "../src/app";
import type { AppType } from "../src/app";
import type { interestMeetings } from "../src/db/schema";
import { createInterestMeetingService } from "../src/services/interest-meetings";
import type { InterestMeetingStore } from "../src/services/interest-meetings";

const semesterId = "00000000-0000-4000-8000-000000000001";
const request = { title: "Interest meeting", startsAt: "2026-10-28T19:00:00-04:00" };

function setup(currentSemester: string | null = semesterId) {
  const meetings: (typeof interestMeetings.$inferInsert & { id: string })[] = [];
  const store: InterestMeetingStore = {
    async currentSemesterId() {
      return currentSemester ?? undefined;
    },
    async insertMeeting(values) {
      const meeting = { ...values, id: crypto.randomUUID() };
      meetings.push(meeting);
      return { id: meeting.id };
    },
    async titleByToken(token) {
      const meeting = meetings.find((entry) => entry.checkinToken === token);
      // Deliberately include private fields to ensure they cannot leak through the service.
      return meeting && { ...meeting, attended: true };
    },
  };
  const service = createInterestMeetingService(store, "https://cssg.example");
  const app = createApp({ meetingService: service });
  const client = hc<AppType>("http://localhost", { fetch: app.request.bind(app) });
  return { app, client, meetings };
}

describe("interest meeting endpoints", () => {
  it("creates a meeting in the current semester and returns only its id and page URL", async () => {
    const { client, meetings } = setup();
    const res = await client.api.v1["interest-meetings"].$post({
      json: { ...request, title: " Interest meeting " },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const parsed = createInterestMeetingResponseSchema.parse(body);
    expect(Object.keys(body).sort()).toEqual(["checkinUrl", "id"]);
    expect(meetings).toHaveLength(1);
    const meeting = meetings[0]!;
    expect(parsed.id).toBe(meeting.id);
    expect(meeting.semesterId).toBe(semesterId);
    expect(meeting.title).toBe("Interest meeting");
    expect(meeting.startsAt).toEqual(new Date("2026-10-28T23:00:00Z"));
    expect(meeting.createdBy).toBeUndefined();
    expect(meeting.checkinToken).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.checkinUrl).toBe(`https://cssg.example/checkin/${meeting.checkinToken}`);
  });

  it("generates distinct random tokens for separate meetings", async () => {
    const { client, meetings } = setup();
    for (let i = 0; i < 2; i++) {
      expect((await client.api.v1["interest-meetings"].$post({ json: request })).status).toBe(201);
    }
    expect(meetings[0]!.checkinToken).not.toBe(meetings[1]!.checkinToken);
  });

  it("returns only the title when the newly created token is looked up", async () => {
    const { client } = setup();
    const created = await client.api.v1["interest-meetings"].$post({ json: request });
    const { checkinUrl } = createInterestMeetingResponseSchema.parse(await created.json());
    const token = new URL(checkinUrl).pathname.split("/").at(-1)!;
    const res = await client.api.v1.public.checkin[":token"].$get({ param: { token } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ title: request.title });
    expect(publicCheckinResponseSchema.parse(body)).toEqual({ title: request.title });
  });

  it("returns 404 NOT_FOUND for an unknown token", async () => {
    const { client } = setup();
    const res = await client.api.v1.public.checkin[":token"].$get({
      param: { token: "unknown-token" },
    });
    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("rejects invalid creation input before storing anything", async () => {
    const { client, meetings } = setup();
    const res = await client.api.v1["interest-meetings"].$post({
      json: { title: " ", startsAt: "not-a-date" },
    });
    expect(res.status).toBe(400);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fields?.title).toBeDefined();
    expect(body.error.fields?.startsAt).toBeDefined();
    expect(meetings).toHaveLength(0);
  });

  it("rejects malformed JSON before storing anything", async () => {
    const { app, meetings } = setup();
    const res = await app.request("/api/v1/interest-meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe("VALIDATION");
    expect(meetings).toHaveLength(0);
  });

  it("returns 409 CONFLICT without inserting when no semester is current", async () => {
    const { client, meetings } = setup(null);
    const res = await client.api.v1["interest-meetings"].$post({ json: request });
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe("CONFLICT");
    expect(meetings).toHaveLength(0);
  });

  it("allows public title lookup even when no semester is current", async () => {
    const { client, meetings } = setup(null);
    meetings.push({
      id: crypto.randomUUID(),
      semesterId,
      title: "Earlier meeting",
      startsAt: new Date(request.startsAt),
      checkinToken: "existing-token",
    });
    const res = await client.api.v1.public.checkin[":token"].$get({
      param: { token: "existing-token" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "Earlier meeting" });
  });

  it("preserves request, success, and error types in the frontend client", () => {
    type Create = (typeof webApi.api.v1)["interest-meetings"]["$post"];
    type Lookup = (typeof webApi.api.v1.public.checkin)[":token"]["$get"];
    expectTypeOf<InferRequestType<Create>["json"]>().toEqualTypeOf<CreateInterestMeetingRequest>();
    expectTypeOf<InferResponseType<Create, 201>>().toEqualTypeOf<CreateInterestMeetingResponse>();
    expectTypeOf<InferResponseType<Create, 400>>().toEqualTypeOf<ErrorResponse>();
    expectTypeOf<InferResponseType<Create, 409>>().toEqualTypeOf<ErrorResponse>();
    expectTypeOf<InferResponseType<Lookup, 200>>().toEqualTypeOf<PublicCheckinResponse>();
    expectTypeOf<InferResponseType<Lookup, 404>>().toEqualTypeOf<ErrorResponse>();
  });
});
