import { Temporal } from "@js-temporal/polyfill";
export type Interval = { start: number; end: number };
export type Opening = {
  open: string;
  close: string;
  breaks?: [string, string][];
};
export type AvailableTime = {
  time: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
};
export const overlaps = (a: Interval, b: Interval) =>
  a.start < b.end && a.end > b.start;
export function localInstant(
  date: string,
  time: string,
  timezone: string,
): number {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("invalid-date-time");
  const d = Temporal.PlainDate.from(date),
    [hour, minute] = time.split(":").map(Number);
  return Temporal.ZonedDateTime.from(
    {
      timeZone: timezone,
      year: d.year,
      month: d.month,
      day: d.day,
      hour,
      minute,
    },
    { disambiguation: "reject" },
  ).epochMilliseconds;
}
export function clinicDate(now: number, timezone: string) {
  return Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}
export function currentWeek(now: number, timezone: string) {
  const today = Temporal.PlainDate.from(clinicDate(now, timezone));
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  return Array.from({ length: 7 }, (_, i) =>
    monday.add({ days: i }).toString(),
  );
}
export function weekday(date: string) {
  return [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ][Temporal.PlainDate.from(date).dayOfWeek - 1];
}
export function clockAt(instant: number, timezone: string) {
  return Temporal.Instant.fromEpochMilliseconds(instant)
    .toZonedDateTimeISO(timezone)
    .toPlainTime()
    .toString({ smallestUnit: "minute" });
}
export function validDuration(duration: number, interval: number) {
  return (
    Number.isInteger(interval) &&
    interval > 0 &&
    Number.isInteger(duration) &&
    duration > 0 &&
    duration % interval === 0
  );
}
export function availableTimes(input: {
  date: string;
  timezone: string;
  duration: number;
  interval: number;
  opening: Opening | null;
  busy: Interval[];
  now: number;
  off?: boolean;
}): AvailableTime[] {
  const { date, timezone, duration, interval, opening, busy, now, off } = input;
  if (!validDuration(duration, interval)) throw new Error("invalid-duration");
  Temporal.PlainDate.from(date);
  if (off || !opening || date < clinicDate(now, timezone)) return [];
  const minute = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let close: number, breaks: Interval[];
  try {
    close = localInstant(date, opening.close, timezone);
    breaks = (opening.breaks || []).map(([s, e]) => ({
      start: localInstant(date, s, timezone),
      end: localInstant(date, e, timezone),
    }));
  } catch {
    return [];
  }
  const result: AvailableTime[] = [];
  for (
    let m = Math.ceil(minute(opening.open) / interval) * interval;
    m < minute(opening.close);
    m += interval
  ) {
    const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    let start: number;
    try {
      start = localInstant(date, time, timezone);
    } catch {
      continue;
    }
    const end = start + duration * 60000;
    if (
      start <= now ||
      end > close ||
      [...busy, ...breaks].some((b) => overlaps({ start, end }, b))
    )
      continue;
    // Avoid presenting a repeated/nonexistent local endpoint without an offset in the compact UI.
    const endTime = clockAt(end, timezone);
    try {
      if (localInstant(date, endTime, timezone) !== end) continue;
    } catch {
      continue;
    }
    result.push({
      time,
      endTime,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
    });
  }
  return result;
}
