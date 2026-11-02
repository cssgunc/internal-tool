const easternDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function easternCalendarDate(date: Date): string {
  return easternDateFormatter
    .formatToParts(date)
    .filter(({ type }) => type === "year" || type === "month" || type === "day")
    .map(({ value }) => value)
    .join("/");
}

/** Attendance runs from meeting start until the next Eastern calendar day. */
export function didAttend(meetingStart: Date, checkedInAt: Date): boolean {
  const start = meetingStart.getTime();
  const checkIn = checkedInAt.getTime();

  if (Number.isNaN(start) || Number.isNaN(checkIn)) {
    throw new RangeError("Meeting start and check-in must be valid dates");
  }

  return checkIn >= start && easternCalendarDate(meetingStart) === easternCalendarDate(checkedInAt);
}

/**
 * The caller supplies the newer submission for the same email as incoming. Timestamps are
 * not compared, so only call this at write time, when incoming is the submission being saved.
 */
export function mergeCheckIns<T extends { attended: boolean }>(existing: T, incoming: T): T {
  return { ...incoming, attended: existing.attended || incoming.attended };
}
