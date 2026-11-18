import { describe, expect, it } from "bun:test";
import {
  isAcceptedApplicationDue,
  isAlumniRecordDue,
  isAuditLogEntryDue,
  isInterestCheckinDue,
  isNonSelectedExecApplicationDue,
  isPerformanceReviewDue,
  isRejectedApplicationDue,
} from "../src/services/retention";

const date = (value: string) => new Date(value);

describe("performance review retention", () => {
  const reviewSemesterStart = date("2026-01-12T00:00:00Z");
  const semesterStarts = [
    reviewSemesterStart,
    date("2026-08-17T00:00:00Z"),
    date("2027-01-11T00:00:00Z"),
    date("2027-08-16T00:00:00Z"),
  ];

  it.each([
    ["2026-08-17T00:00:00Z", false],
    ["2027-01-11T00:00:00Z", false],
    ["2027-08-15T23:59:59.999Z", false],
    ["2027-08-16T00:00:00Z", true],
    ["2027-08-16T00:00:00.001Z", true],
  ])("keeps the TDD Spring 2026 review through Spring 2027 as of %s", (asOf, expected) => {
    expect(
      isPerformanceReviewDue({
        reviewSemesterStart,
        semesterStarts,
        memberStatus: "active",
        asOf: date(asOf),
      })
    ).toBe(expected);
  });

  it("deletes alumni reviews immediately without requiring future semesters", () => {
    expect(
      isPerformanceReviewDue({
        reviewSemesterStart,
        semesterStarts: [],
        memberStatus: "alumni",
        asOf: reviewSemesterStart,
      })
    ).toBe(true);
  });

  it("sorts and deduplicates starts, ignores the original and earlier semesters, and does not mutate", () => {
    const starts = Object.freeze([
      semesterStarts[3]!,
      reviewSemesterStart,
      date("2025-08-18T00:00:00Z"),
      semesterStarts[1]!,
      semesterStarts[2]!,
      semesterStarts[1]!,
    ]);
    const before = starts.map((start) => start.getTime());
    expect(
      isPerformanceReviewDue({
        reviewSemesterStart,
        semesterStarts: starts,
        memberStatus: "active",
        asOf: date("2027-01-11T00:00:00Z"),
      })
    ).toBe(false);
    expect(
      isPerformanceReviewDue({
        reviewSemesterStart,
        semesterStarts: starts,
        memberStatus: "active",
        asOf: semesterStarts[3]!,
      })
    ).toBe(true);
    expect(starts.map((start) => start.getTime())).toEqual(before);
  });

  it("uses irregular actual start dates rather than fixed semester lengths", () => {
    const starts = [
      date("2026-05-01T00:00:00Z"),
      date("2026-09-03T00:00:00Z"),
      date("2028-02-20T00:00:00Z"),
    ];
    expect(
      isPerformanceReviewDue({
        reviewSemesterStart,
        semesterStarts: starts,
        memberStatus: "active",
        asOf: date("2028-02-19T23:59:59.999Z"),
      })
    ).toBe(false);
    expect(
      isPerformanceReviewDue({
        reviewSemesterStart,
        semesterStarts: starts,
        memberStatus: "active",
        asOf: starts[2]!,
      })
    ).toBe(true);
  });

  it("does not delete when fewer than three subsequent semesters are supplied", () => {
    expect(
      isPerformanceReviewDue({
        reviewSemesterStart,
        semesterStarts: semesterStarts.slice(0, 3),
        memberStatus: "active",
        asOf: date("2030-01-01T00:00:00Z"),
      })
    ).toBe(false);
  });
});

// These predicates accept only already-rejected / non-selected applications.
// Manual early wipes are a separate operation, not an automatic eligibility exception.
const applicationRules = [
  {
    name: "rejected new-member applications",
    due: (semesterStart: Date, completedAt: Date | null, asOf: Date) =>
      isRejectedApplicationDue({ semesterStart, recruitingDoneAt: completedAt, asOf }),
    deadline: "2026-04-16T00:00:00Z",
    previous: "2026-04-15T23:59:59.999Z",
    monthEnds: [
      ["2026-01-31T00:00:00Z", "2026-04-15T00:00:00Z"],
      ["2026-12-31T00:00:00Z", "2027-03-15T00:00:00Z"],
      ["2023-12-31T00:00:00Z", "2024-03-15T00:00:00Z"],
      ["2024-02-29T00:00:00Z", "2024-05-14T00:00:00Z"],
    ],
  },
  {
    name: "non-selected exec applications",
    due: (semesterStart: Date, completedAt: Date | null, asOf: Date) =>
      isNonSelectedExecApplicationDue({ semesterStart, execRoundDoneAt: completedAt, asOf }),
    deadline: "2026-03-01T00:00:00Z",
    previous: "2026-02-28T23:59:59.999Z",
    monthEnds: [
      ["2026-01-31T00:00:00Z", "2026-02-28T00:00:00Z"],
      ["2024-01-31T00:00:00Z", "2024-02-29T00:00:00Z"],
      ["2026-08-31T00:00:00Z", "2026-09-30T00:00:00Z"],
      ["2026-12-31T00:00:00Z", "2027-01-31T00:00:00Z"],
    ],
  },
];

for (const rule of applicationRules) {
  describe(rule.name, () => {
    const start = date("2026-02-01T00:00:00Z");
    const deadline = date(rule.deadline);

    it("is false just before and true exactly at and after the age deadline", () => {
      expect(rule.due(start, start, date(rule.previous))).toBe(false);
      expect(rule.due(start, start, deadline)).toBe(true);
      expect(rule.due(start, start, new Date(deadline.getTime() + 1))).toBe(true);
    });

    it("never deletes before completion, even after the age deadline", () => {
      const later = new Date(deadline.getTime() + 1000);
      expect(rule.due(start, null, later)).toBe(false);
      expect(rule.due(start, later, deadline)).toBe(false);
      expect(rule.due(start, later, new Date(later.getTime() - 1))).toBe(false);
      expect(rule.due(start, later, later)).toBe(true);
    });

    it("requires the age deadline even when completion is earlier", () => {
      expect(rule.due(start, start, start)).toBe(false);
    });

    it("accepts completion exactly at the age deadline", () => {
      expect(rule.due(start, deadline, deadline)).toBe(true);
    });

    for (const [from, to] of rule.monthEnds) {
      it(`clamps calendar months and handles leap/year boundaries: ${from}`, () => {
        const semesterStart = date(from!);
        const due = date(to!);
        expect(rule.due(semesterStart, semesterStart, new Date(due.getTime() - 1))).toBe(false);
        expect(rule.due(semesterStart, semesterStart, due)).toBe(true);
      });
    }

    it("preserves UTC time through calendar arithmetic and does not mutate input dates", () => {
      const semesterStart = date("2026-02-01T12:34:56.789Z");
      const done = date("2026-02-02T00:00:00Z");
      const asOf = new Date(deadline.getTime() + 12 * 3600000 + 34 * 60000 + 56789);
      const before = [semesterStart, done, asOf].map((value) => value.getTime());
      expect(rule.due(semesterStart, done, asOf)).toBe(true);
      expect(rule.due(semesterStart, done, new Date(asOf.getTime() - 1))).toBe(false);
      expect([semesterStart, done, asOf].map((value) => value.getTime())).toEqual(before);
    });

    it("rejects invalid dates rather than silently treating a record as due", () => {
      expect(() => rule.due(new Date(NaN), start, deadline)).toThrow(RangeError);
      expect(() => rule.due(start, new Date(NaN), deadline)).toThrow(RangeError);
      expect(() => rule.due(start, start, new Date(NaN))).toThrow(RangeError);
    });
  });
}

describe("other table rules", () => {
  it("keeps accepted applications for active members and deletes them for alumni", () => {
    expect(isAcceptedApplicationDue("active")).toBe(false);
    expect(isAcceptedApplicationDue("alumni")).toBe(true);
  });

  it("keeps check-ins through the inclusive semester end date", () => {
    const semesterEndsOn = date("2026-12-11T00:00:00Z");
    const before = semesterEndsOn.getTime();
    expect(isInterestCheckinDue({ semesterEndsOn, asOf: date("2026-12-11T23:59:59.999Z") })).toBe(
      false
    );
    expect(isInterestCheckinDue({ semesterEndsOn, asOf: date("2026-12-12T00:00:00Z") })).toBe(true);
    expect(isInterestCheckinDue({ semesterEndsOn, asOf: date("2026-12-12T00:00:00.001Z") })).toBe(
      true
    );
    expect(semesterEndsOn.getTime()).toBe(before);
  });

  it("handles a year-end semester and equivalent instants with time-zone offsets", () => {
    const semesterEndsOn = date("2026-12-31T00:00:00Z");
    expect(isInterestCheckinDue({ semesterEndsOn, asOf: date("2026-12-31T19:00:00-05:00") })).toBe(
      true
    );
  });

  it("never deletes alumni records or audit entries", () => {
    expect(isAlumniRecordDue()).toBe(false);
    expect(isAuditLogEntryDue()).toBe(false);
  });

  it("rejects invalid review/check-in dates", () => {
    const valid = date("2026-01-01T00:00:00Z");
    expect(() =>
      isPerformanceReviewDue({
        reviewSemesterStart: new Date(NaN),
        semesterStarts: [],
        memberStatus: "active",
        asOf: valid,
      })
    ).toThrow(RangeError);
    expect(() =>
      isPerformanceReviewDue({
        reviewSemesterStart: valid,
        semesterStarts: [new Date(NaN)],
        memberStatus: "active",
        asOf: valid,
      })
    ).toThrow(RangeError);
    expect(() =>
      isPerformanceReviewDue({
        reviewSemesterStart: valid,
        semesterStarts: [],
        memberStatus: "active",
        asOf: new Date(NaN),
      })
    ).toThrow(RangeError);
    expect(() => isInterestCheckinDue({ semesterEndsOn: new Date(NaN), asOf: valid })).toThrow(
      RangeError
    );
    expect(() => isInterestCheckinDue({ semesterEndsOn: valid, asOf: new Date(NaN) })).toThrow(
      RangeError
    );
  });
});
