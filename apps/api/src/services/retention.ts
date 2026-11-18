import type { members } from "../db/schema/members";

type MemberStatus = (typeof members.$inferSelect)["status"];

function timestamp(date: Date): number {
  const value = date.getTime();
  if (!Number.isFinite(value)) throw new RangeError("Retention inputs must be valid dates");
  return value;
}

function addUtcCalendarMonths(date: Date, months: number): Date {
  const result = new Date(timestamp(date));
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(result.getTime());
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  result.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  return result;
}

/** Keep through two subsequent semesters; delete at the third actual semester start. */
export function isPerformanceReviewDue({
  reviewSemesterStart,
  semesterStarts,
  memberStatus,
  asOf,
}: {
  reviewSemesterStart: Date;
  semesterStarts: readonly Date[];
  memberStatus: MemberStatus;
  asOf: Date;
}): boolean {
  const now = timestamp(asOf);
  const originalStart = timestamp(reviewSemesterStart);
  if (memberStatus === "alumni") return true;
  // Count distinct semesters after the original, regardless of input ordering.
  const subsequentStarts = [...new Set(semesterStarts.map(timestamp))]
    .filter((start) => start > originalStart)
    .sort((a, b) => a - b);
  const deletionStart = subsequentStarts[2];
  return deletionStart !== undefined && now >= deletionStart;
}

/** 2.5 months means two clamped UTC calendar months, followed by 15 calendar days. */
export function isRejectedApplicationDue({
  semesterStart,
  recruitingDoneAt,
  asOf,
}: {
  semesterStart: Date;
  recruitingDoneAt: Date | null;
  asOf: Date;
}): boolean {
  const deadline = addUtcCalendarMonths(semesterStart, 2);
  deadline.setUTCDate(deadline.getUTCDate() + 15);
  const now = timestamp(asOf);
  return (
    recruitingDoneAt !== null && now >= timestamp(recruitingDoneAt) && now >= timestamp(deadline)
  );
}

/** The age deadline and Exec round done must both have been reached. */
export function isNonSelectedExecApplicationDue({
  semesterStart,
  execRoundDoneAt,
  asOf,
}: {
  semesterStart: Date;
  execRoundDoneAt: Date | null;
  asOf: Date;
}): boolean {
  const deadline = addUtcCalendarMonths(semesterStart, 1);
  const now = timestamp(asOf);
  return (
    execRoundDoneAt !== null && now >= timestamp(execRoundDoneAt) && now >= timestamp(deadline)
  );
}

/** Accepted applications are retained while the member is active. */
export function isAcceptedApplicationDue(memberStatus: MemberStatus): boolean {
  return memberStatus === "alumni";
}

/** TDD's suggested rule: ends_on is inclusive; due at the following UTC midnight. */
export function isInterestCheckinDue({
  semesterEndsOn,
  asOf,
}: {
  semesterEndsOn: Date;
  asOf: Date;
}): boolean {
  const deadline = new Date(timestamp(semesterEndsOn));
  deadline.setUTCHours(0, 0, 0, 0);
  deadline.setUTCDate(deadline.getUTCDate() + 1);
  return timestamp(asOf) >= timestamp(deadline);
}

/** The slim alumni record is kept permanently. */
export function isAlumniRecordDue(): boolean {
  return false;
}

/** Audit entries are kept; scrubbing related values is separate from deleting entries. */
export function isAuditLogEntryDue(): boolean {
  return false;
}
