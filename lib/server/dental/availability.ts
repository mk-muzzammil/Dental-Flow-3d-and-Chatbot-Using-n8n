import {
  availableTimes,
  currentWeek,
  clinicDate,
  weekday,
  validDuration,
  type Opening,
  type Interval,
} from "@/lib/availability";
import { DF } from "./rules";
import type { Row, BusyResponse, Doctor } from "./types";
import { digest } from "../security";
export const availabilityVersion = (data: Row[][]) =>
  digest(JSON.stringify(data));
export function openingFor(
  rows: Row[],
  doctor: string,
  date: string,
): Opening | null {
  const day = weekday(date).toLowerCase(),
    closed = (r?: Row) => !r || String(r[5]).toUpperCase() === "TRUE";
  const clinic = rows.find((r) => !r[6] && String(r[0]).toLowerCase() === day);
  if (closed(clinic)) return null;
  const own = rows.filter(
    (r) => String(r[6] || "").toLowerCase() === doctor.toLowerCase(),
  );
  const custom = own.length
    ? own.find((r) => String(r[0]).toLowerCase() === day)
    : clinic;
  if (closed(custom)) return null;
  const open = [String(clinic![1] || "10:00"), String(custom![1] || "10:00")]
    .sort()
    .at(-1)!;
  const close = [
    String(clinic![2] || "19:00"),
    String(custom![2] || "19:00"),
  ].sort()[0];
  if (open >= close) return null;
  return {
    open,
    close,
    breaks: [clinic!, custom!]
      .filter((r) => r[3] && r[4])
      .map((r) => [String(r[3]), String(r[4])]),
  };
}
export function calculateDay(
  data: Row[][],
  docs: Doctor[],
  busy: BusyResponse,
  serviceId: string,
  date: string,
  now = Date.now(),
) {
  const settings = DF.settings(data[2]),
    timezone = String(settings.timezone || "Asia/Karachi"),
    interval = Number(settings.slot_granularity ?? 30);
  const service = DF.services(data[0]).find(
    (s) => s.id === serviceId && s.active,
  );
  const base = {
    date,
    timezone,
    version: availabilityVersion(data),
    service: serviceId,
    durationMin: service?.min || 0,
    price: service?.price || 0,
    serviceName: service?.name || "",
    options: [] as (ReturnType<typeof availableTimes>[number] & {
      date: string;
      doctor: string;
      doctorName: string;
    })[],
    slots: [] as string[],
    byDoctor: [] as { doctor: string; doctorName: string; slots: string[] }[],
  };
  if (!service) return { ...base, reason: "service-inactive" };
  if (!validDuration(service.min, interval))
    return { ...base, reason: "invalid-duration" };
  if (!currentWeek(now, timezone).includes(date))
    return { ...base, reason: "outside-current-week" };
  if (date < clinicDate(now, timezone)) return { ...base, reason: "past" };
  if (data[3].some((r) => String(r[0]) === date))
    return { ...base, reason: "closed" };
  let working = 0,
    unreadable = 0;
  const candidates: typeof base.options = [];
  const ordered = docs
    .map((d, index) => {
      const cal = busy.calendars?.[d.calendarId];
      return {
        d,
        index,
        cal,
        load: (cal?.busy || []).reduce(
          (n, b) => n + Date.parse(b.end || "") - Date.parse(b.start || ""),
          0,
        ),
      };
    })
    .sort((a, b) => a.load - b.load || a.index - b.index);
  for (const { d, cal } of ordered) {
    const opening = openingFor(data[1], d.id, date);
    if (!opening) continue;
    working++;
    if (!cal || cal.errors?.length) {
      unreadable++;
      continue;
    }
    const blocks: Interval[] = (cal.busy || []).map((b) => ({
      start: Date.parse(b.start || ""),
      end: Date.parse(b.end || ""),
    }));
    if (
      blocks.some((b) => !Number.isFinite(b.start) || !Number.isFinite(b.end))
    ) {
      unreadable++;
      continue;
    }
    const times = availableTimes({
      date,
      timezone,
      duration: service.min,
      interval,
      opening,
      busy: blocks,
      now,
    });
    base.byDoctor.push({
      doctor: d.id,
      doctorName: d.name,
      slots: times.map((t) => t.time),
    });
    for (const t of times)
      candidates.push({ ...t, date, doctor: d.id, doctorName: d.name });
  }
  const seen = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) if (!seen.has(c.time)) seen.set(c.time, c);
  base.options = [...seen.values()].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  base.slots = base.options.map((t) => t.time);
  return {
    ...base,
    ...(base.options.length
      ? {}
      : {
          reason: !working
            ? "closed"
            : unreadable
              ? "unavailable"
              : "fully-booked",
        }),
  };
}
