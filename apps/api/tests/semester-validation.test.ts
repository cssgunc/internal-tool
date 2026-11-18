import { describe, expect, it } from "bun:test";
import { createSemesterSchema, updateSemesterDatesSchema } from "@internal-tool/shared";

const validSemester = {
  term: "fall" as const,
  year: 2026,
  startsOn: "2026-08-17",
  endsOn: "2026-12-11",
};

describe("semester creation validation", () => {
  it("accepts a valid semester", () => {
    const result = createSemesterSchema.safeParse(validSemester);

    expect(result.success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = createSemesterSchema.safeParse({
      ...validSemester,
      endsOn: "2026-08-01",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endsOn"]);
    }
  });

  it("rejects matching start and end dates", () => {
    const result = createSemesterSchema.safeParse({
      ...validSemester,
      endsOn: validSemester.startsOn,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid term", () => {
    const result = createSemesterSchema.safeParse({
      ...validSemester,
      term: "summer",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid year", () => {
    const result = createSemesterSchema.safeParse({
      ...validSemester,
      year: 1999,
    });

    expect(result.success).toBe(false);
  });
});

describe("semester date updates", () => {
  it("accepts valid updated dates", () => {
    const result = updateSemesterDatesSchema.safeParse({
      startsOn: "2026-08-20",
      endsOn: "2026-12-15",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid updated dates", () => {
    const result = updateSemesterDatesSchema.safeParse({
      startsOn: "2026-12-15",
      endsOn: "2026-08-20",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endsOn"]);
    }
  });
});
