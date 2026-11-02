import { describe, expect, it } from "bun:test";
import { didAttend, mergeCheckIns } from "../src/services/check-ins";

describe("didAttend", () => {
  const meetingStart = new Date("2026-10-20T19:00:00-04:00");

  it.each([
    ["before the start", "2026-10-20T18:59:59.999-04:00", false],
    ["exactly at the start", "2026-10-20T19:00:00-04:00", true],
    ["later that evening", "2026-10-20T21:00:00-04:00", true],
    ["at 11:59 PM", "2026-10-20T23:59:00-04:00", true],
    ["at 11:59:59 PM", "2026-10-20T23:59:59-04:00", true],
    ["during the final millisecond", "2026-10-20T23:59:59.999-04:00", true],
    ["at the next midnight", "2026-10-21T00:00:00-04:00", false],
  ])("checks attendance %s", (_label, checkedInAt, expected) => {
    expect(didAttend(meetingStart, new Date(checkedInAt))).toBe(expected);
  });

  it("uses Eastern dates even when the UTC calendar day changes", () => {
    expect(didAttend(meetingStart, new Date("2026-10-21T03:30:00Z"))).toBe(true);
    expect(didAttend(meetingStart, new Date("2026-10-21T04:00:00Z"))).toBe(false);
  });

  it("limits an 11:30 PM meeting to the remainder of that Eastern day", () => {
    const lateStart = new Date("2026-10-20T23:30:00-04:00");
    expect(didAttend(lateStart, new Date("2026-10-20T23:45:00-04:00"))).toBe(true);
    expect(didAttend(lateStart, new Date("2026-10-21T00:00:00-04:00"))).toBe(false);
  });

  it.each([
    [new Date(NaN), meetingStart],
    [meetingStart, new Date(NaN)],
    [new Date(NaN), new Date(NaN)],
  ])("rejects invalid dates (%s, %s)", (start, checkIn) => {
    expect(() => didAttend(start, checkIn)).toThrow(RangeError);
  });

  describe("spring forward on March 8, 2026", () => {
    const start = new Date("2026-03-08T01:30:00-05:00");

    it("accepts a check-in across the missing hour", () => {
      expect(didAttend(start, new Date("2026-03-08T03:00:00-04:00"))).toBe(true);
    });

    it("rejects an earlier instant across the clock jump", () => {
      expect(
        didAttend(new Date("2026-03-08T03:00:00-04:00"), new Date("2026-03-08T01:59:59-05:00"))
      ).toBe(false);
    });

    it("uses the post-transition offset at the end of the day", () => {
      expect(didAttend(start, new Date("2026-03-08T23:59:59.999-04:00"))).toBe(true);
      expect(didAttend(start, new Date("2026-03-09T00:00:00-04:00"))).toBe(false);
    });
  });

  describe("fall back on November 1, 2026", () => {
    const start = new Date("2026-11-01T00:30:00-04:00");

    it.each(["2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"])(
      "accepts the repeated hour at %s",
      (checkIn) => {
        expect(didAttend(start, new Date(checkIn))).toBe(true);
      }
    );

    it("accepts a later instant even when its local clock time is earlier", () => {
      expect(
        didAttend(new Date("2026-11-01T01:45:00-04:00"), new Date("2026-11-01T01:15:00-05:00"))
      ).toBe(true);
    });

    it("rejects an earlier instant even when its local clock time is later", () => {
      expect(
        didAttend(new Date("2026-11-01T01:15:00-05:00"), new Date("2026-11-01T01:45:00-04:00"))
      ).toBe(false);
    });

    it("uses the post-transition offset at the end of the day", () => {
      expect(didAttend(start, new Date("2026-11-01T23:59:59.999-05:00"))).toBe(true);
      expect(didAttend(start, new Date("2026-11-02T00:00:00-05:00"))).toBe(false);
    });
  });
});

describe("mergeCheckIns", () => {
  it.each([
    [false, false, false],
    [false, true, true],
    [true, false, true],
    [true, true, true],
  ])("merges existing=%s and incoming=%s into attended=%s", (existing, incoming, expected) => {
    expect(mergeCheckIns({ attended: existing }, { attended: incoming })).toEqual({
      attended: expected,
    });
  });

  it("uses only incoming details, preserves attendance, and leaves both inputs unchanged", () => {
    type CheckIn = { attended: boolean; email: string; name: string; oldDetail?: string };
    const existing: CheckIn = Object.freeze({
      attended: true,
      email: "applicant@example.com",
      name: "Old name",
      oldDetail: "existing only",
    });
    const incoming: CheckIn = Object.freeze({
      attended: false,
      email: "applicant@example.com",
      name: "New name",
    });
    const existingBefore = { ...existing };
    const incomingBefore = { ...incoming };

    const merged = mergeCheckIns(existing, incoming);

    expect(merged).toEqual({ attended: true, email: "applicant@example.com", name: "New name" });
    expect(merged).not.toHaveProperty("oldDetail");
    expect(merged).not.toBe(existing);
    expect(merged).not.toBe(incoming);
    expect(existing).toEqual(existingBefore);
    expect(incoming).toEqual(incomingBefore);
  });
});
