import { describe, expect, it } from "bun:test";
import type { z } from "zod";
import {
  createInterestMeetingRequestSchema,
  createInterestMeetingResponseSchema,
  INTEREST_KINDS,
  interestKindSchema,
  publicCheckinResponseSchema,
  submitInterestRequestSchema,
  submitInterestResponseSchema,
} from "../src";

const submission = {
  firstName: "Fake",
  lastName: "Applicant",
  email: "fake@example.com",
  interests: ["project"],
} satisfies z.input<typeof submitInterestRequestSchema>;

describe("interest schemas", () => {
  it("supports exactly the TDD's interest kinds", () => {
    for (const kind of INTEREST_KINDS) expect(interestKindSchema.parse(kind)).toBe(kind);
    expect(interestKindSchema.safeParse("both").success).toBe(false);
  });

  it("accepts meeting timestamps with UTC or an explicit timezone offset", () => {
    for (const startsAt of ["2026-10-28T23:00:00Z", "2026-10-28T19:00:00-04:00"]) {
      expect(createInterestMeetingRequestSchema.parse({ title: " Meeting ", startsAt })).toEqual({
        title: "Meeting",
        startsAt,
      });
    }
  });

  it("rejects blank/oversized titles and ambiguous or invalid timestamps", () => {
    for (const value of [
      { title: " ", startsAt: "2026-10-28T23:00:00Z" },
      { title: "x".repeat(201), startsAt: "2026-10-28T23:00:00Z" },
      { title: "Meeting", startsAt: "2026-10-28T19:00:00" },
      { title: "Meeting", startsAt: "not-a-date" },
    ])
      expect(createInterestMeetingRequestSchema.safeParse(value).success).toBe(false);
  });

  it("accepts tokenless submissions without requiring Turnstile yet", () => {
    expect(submitInterestRequestSchema.parse(submission)).toEqual({ ...submission, website: "" });
  });

  it("normalizes names and email and accepts a meeting token", () => {
    const result = submitInterestRequestSchema.parse({
      ...submission,
      firstName: " Fake ",
      lastName: " Applicant ",
      email: " FAKE@EXAMPLE.COM ",
      token: "a".repeat(64),
      interests: ["project", "education", "exec"],
    });
    expect(result.firstName).toBe("Fake");
    expect(result.lastName).toBe("Applicant");
    expect(result.email).toBe("fake@example.com");
    expect(result.token).toBe("a".repeat(64));
  });

  it("accepts a filled honeypot so the route can silently discard it", () => {
    expect(
      submitInterestRequestSchema.parse({ ...submission, website: "bot.example" }).website
    ).toBe("bot.example");
  });

  it("rejects missing or invalid submission fields and excessive lengths", () => {
    for (const value of [
      {},
      { ...submission, firstName: " " },
      { ...submission, lastName: "x".repeat(101) },
      { ...submission, email: "invalid" },
      { ...submission, interests: [] },
      { ...submission, interests: ["both"] },
      { ...submission, interests: ["project", "education", "exec", "project"] },
      { ...submission, token: "" },
      { ...submission, token: "x".repeat(129) },
      { ...submission, website: "x".repeat(2049) },
      { ...submission, turnstileToken: "x".repeat(2049) },
    ])
      expect(submitInterestRequestSchema.safeParse(value).success).toBe(false);
  });

  it("defines meeting creation and public responses without private data", () => {
    const meeting = {
      id: "00000000-0000-4000-8000-000000000001",
      checkinUrl: "https://example.com/checkin/token",
    };
    expect(createInterestMeetingResponseSchema.parse(meeting)).toEqual(meeting);
    expect(
      createInterestMeetingResponseSchema.safeParse({ id: "invalid", checkinUrl: "/checkin/token" })
        .success
    ).toBe(false);
    expect(
      publicCheckinResponseSchema.parse({
        title: "Meeting",
        attended: true,
        checkinToken: "secret",
      })
    ).toEqual({ title: "Meeting" });
    expect(submitInterestResponseSchema.parse({ success: true })).toEqual({ success: true });
    expect(submitInterestResponseSchema.safeParse({ success: false }).success).toBe(false);
  });
});
