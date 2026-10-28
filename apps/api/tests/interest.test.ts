import { describe, expect, expectTypeOf, it } from "bun:test";
import { errorResponseSchema, submitInterestResponseSchema } from "@internal-tool/shared";
import type {
  ErrorResponse,
  SubmitInterestResponse,
  submitInterestRequestSchema,
} from "@internal-tool/shared";
import { hc } from "hono/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { z } from "zod";
import type { api as webApi } from "../../web/src/lib/api";
import { createApp } from "../src/app";
import type { AppType } from "../src/app";
import { createInterestService } from "../src/services/interest";
import type { InterestCheckinWrite, InterestStore } from "../src/services/interest";

const semesterId = "00000000-0000-4000-8000-000000000001";
const otherSemesterId = "00000000-0000-4000-8000-000000000002";
const meeting = {
  id: "00000000-0000-4000-8000-000000000003",
  semesterId,
  startsAt: new Date("2026-10-28T19:00:00-04:00"),
};
const submission = {
  firstName: "Fake",
  lastName: "Applicant",
  email: "fake@example.com",
  interests: ["project"],
} satisfies z.input<typeof submitInterestRequestSchema>;

function setup(options: { semester?: string | null; checkedInAt?: Date } = {}) {
  let currentSemester = options.semester === undefined ? semesterId : options.semester;
  let clock = options.checkedInAt ?? new Date("2026-10-28T20:00:00-04:00");
  const records = new Map<string, InterestCheckinWrite>();
  let storageCalls = 0;
  const store: InterestStore = {
    async currentSemesterId() {
      storageCalls++;
      return currentSemester ?? undefined;
    },
    async meetingByToken(token) {
      storageCalls++;
      if (token === "meeting-token") return meeting;
      if (token === "old-token") return { ...meeting, semesterId: otherSemesterId };
      return undefined;
    },
    async existingAttendance(semester, email) {
      storageCalls++;
      const existing = records.get(`${semester}:${email.toLowerCase()}`);
      return existing && { attended: existing.attended };
    },
    async upsertCheckin(values) {
      storageCalls++;
      const key = `${values.semesterId}:${values.email.toLowerCase()}`;
      const existing = records.get(key);
      records.set(key, { ...values, attended: (existing?.attended ?? false) || values.attended });
    },
  };
  const service = createInterestService(store, () => clock);
  const app = createApp({ interestService: service });
  const client = hc<AppType>("http://localhost", { fetch: app.request.bind(app) });
  return {
    app,
    client,
    records,
    storageCalls: () => storageCalls,
    setClock(value: Date) {
      clock = value;
    },
    setSemester(value: string) {
      currentSemester = value;
    },
  };
}

describe("POST /api/v1/public/interest", () => {
  it("joins the current semester's list without a token and without attendance", async () => {
    const { client, records } = setup();
    const res = await client.api.v1.public.interest.$post({ json: submission });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true });
    expect(records.size).toBe(1);
    expect([...records.values()][0]).toEqual({
      ...submission,
      semesterId,
      meetingId: null,
      attended: false,
      submittedAt: new Date("2026-10-29T00:00:00Z"),
    });
  });

  it.each([
    ["before start", "2026-10-28T18:59:59-04:00", false],
    ["at start", "2026-10-28T19:00:00-04:00", true],
    ["during the meeting", "2026-10-28T20:00:00-04:00", true],
    ["last millisecond of the Eastern day", "2026-10-28T23:59:59.999-04:00", true],
    ["next midnight", "2026-10-29T00:00:00-04:00", false],
  ])("calculates attendance %s using the server clock", async (_label, checkedInAt, attended) => {
    const { client, records } = setup({ checkedInAt: new Date(checkedInAt) });
    const res = await client.api.v1.public.interest.$post({
      json: { ...submission, token: "meeting-token" },
    });
    expect(res.status).toBe(201);
    expect([...records.values()][0]?.attended).toBe(attended);
    expect([...records.values()][0]?.meetingId).toBe(meeting.id);
  });

  it("updates repeat submissions, normalizes email, and preserves attendance", async () => {
    const { client, records, setClock } = setup();
    await client.api.v1.public.interest.$post({
      json: { ...submission, email: " FAKE@EXAMPLE.COM ", token: "meeting-token" },
    });
    setClock(new Date("2026-10-29T12:00:00-04:00"));
    const res = await client.api.v1.public.interest.$post({
      json: {
        ...submission,
        firstName: " Updated ",
        interests: ["education"],
      },
    });
    expect(res.status).toBe(201);
    expect(records.size).toBe(1);
    expect([...records.values()][0]).toEqual({
      ...submission,
      firstName: "Updated",
      interests: ["education"],
      semesterId,
      meetingId: null,
      attended: true,
      submittedAt: new Date("2026-10-29T16:00:00Z"),
    });
  });

  it("upgrades an earlier tokenless check-in to attended", async () => {
    const { client, records } = setup();
    await client.api.v1.public.interest.$post({ json: submission });
    expect([...records.values()][0]?.attended).toBe(false);
    await client.api.v1.public.interest.$post({ json: { ...submission, token: "meeting-token" } });
    expect(records.size).toBe(1);
    expect([...records.values()][0]?.attended).toBe(true);
  });

  it("keeps attendance false when neither submission counted", async () => {
    const { client, records } = setup({ checkedInAt: new Date("2026-10-29T12:00:00-04:00") });
    await client.api.v1.public.interest.$post({ json: submission });
    await client.api.v1.public.interest.$post({ json: { ...submission, token: "meeting-token" } });
    expect(records.size).toBe(1);
    expect([...records.values()][0]?.attended).toBe(false);
  });

  it("does not carry attendance into a different semester", async () => {
    const { client, records, setSemester } = setup();
    await client.api.v1.public.interest.$post({ json: { ...submission, token: "meeting-token" } });
    setSemester(otherSemesterId);
    await client.api.v1.public.interest.$post({ json: submission });
    expect(records.size).toBe(2);
    expect(records.get(`${semesterId}:${submission.email}`)?.attended).toBe(true);
    expect(records.get(`${otherSemesterId}:${submission.email}`)?.attended).toBe(false);
  });

  it("returns 409 CONFLICT when no semester is current and stores nothing", async () => {
    const { client, records } = setup({ semester: null });
    const res = await client.api.v1.public.interest.$post({ json: submission });
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe("CONFLICT");
    expect(records.size).toBe(0);
  });

  it.each(["unknown-token", "old-token"])("rejects %s without saving", async (token) => {
    const { client, records } = setup();
    const res = await client.api.v1.public.interest.$post({ json: { ...submission, token } });
    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe("NOT_FOUND");
    expect(records.size).toBe(0);
  });

  it("returns the same success for a filled honeypot without accessing storage", async () => {
    const { client, records, storageCalls } = setup();
    const res = await client.api.v1.public.interest.$post({
      json: { ...submission, website: "bot.example" },
    });
    expect(res.status).toBe(201);
    expect(submitInterestResponseSchema.parse(await res.json())).toEqual({ success: true });
    expect(records.size).toBe(0);
    expect(storageCalls()).toBe(0);
  });

  it("discards honeypots even with invalid fields and no current semester", async () => {
    const { app, records, storageCalls } = setup({ semester: null });
    for (const website of ["filled", " ", "x".repeat(2049)]) {
      const res = await app.request("/api/v1/public/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ success: true });
    }
    expect(records.size).toBe(0);
    expect(storageCalls()).toBe(0);
  });

  it("validates normal submissions before accessing storage", async () => {
    const { client, records, storageCalls } = setup();
    const res = await client.api.v1.public.interest.$post({
      json: {
        ...submission,
        email: "bad",
        firstName: " ",
        interests: [],
      },
    });
    expect(res.status).toBe(400);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fields?.email).toBeDefined();
    expect(body.error.fields?.firstName).toBeDefined();
    expect(body.error.fields?.interests).toBeDefined();
    expect(records.size).toBe(0);
    expect(storageCalls()).toBe(0);
  });

  it("returns standard validation errors for malformed and non-object JSON", async () => {
    const { app, storageCalls } = setup();
    for (const body of ["{", "", "null", "[]", '"text"']) {
      const res = await app.request("/api/v1/public/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(res.status).toBe(400);
      expect(errorResponseSchema.parse(await res.json()).error.code).toBe("VALIDATION");
    }
    expect(storageCalls()).toBe(0);
  });

  it("ignores client-supplied attendance, semester, and timestamps", async () => {
    const { app, records } = setup();
    const res = await app.request("/api/v1/public/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...submission,
        attended: true,
        semesterId: otherSemesterId,
        submittedAt: "2000-01-01",
      }),
    });
    expect(res.status).toBe(201);
    const saved = [...records.values()][0]!;
    expect(saved.attended).toBe(false);
    expect(saved.semesterId).toBe(semesterId);
    expect(saved.submittedAt).toEqual(new Date("2026-10-29T00:00:00Z"));
    expect("website" in saved).toBe(false);
    expect("turnstileToken" in saved).toBe(false);
  });

  it("preserves frontend request, success, and error inference", () => {
    type Submit = typeof webApi.api.v1.public.interest.$post;
    expectTypeOf<InferRequestType<Submit>["json"]>().toEqualTypeOf<
      z.input<typeof submitInterestRequestSchema>
    >();
    expectTypeOf<InferResponseType<Submit, 201>>().toEqualTypeOf<SubmitInterestResponse>();
    expectTypeOf<InferResponseType<Submit, 400>>().toEqualTypeOf<ErrorResponse>();
    expectTypeOf<InferResponseType<Submit, 404>>().toEqualTypeOf<ErrorResponse>();
    expectTypeOf<InferResponseType<Submit, 409>>().toEqualTypeOf<ErrorResponse>();
  });
});
