import "server-only";
import { appointments, startAt } from "./appointments";
import { openingFor } from "./availability";
import { localInstant, overlaps } from "@/lib/availability";
import { digest } from "../security";
import type { ClinicConfiguration } from "../storage/profile";
export async function settingsImpact(configuration: ClinicConfiguration) {
  const settings = Object.fromEntries(
      configuration.settings.map((r) => [String(r[0]), r[1]]),
    ),
    timezone = String(settings.timezone || "Asia/Karachi");
  const warnings: { reference: string; date: string; reason: string }[] = [];
  for (const { booking: b } of await appointments()) {
    if (
      !["PENDING", "CONFIRMED"].includes(b.status) ||
      startAt(b) <= Date.now()
    )
      continue;
    const opening = openingFor(configuration.hours, b.doctorId, b.date),
      start = startAt(b),
      end = b.endsAt ? Date.parse(b.endsAt) : start + b.minutes * 60000;
    let reason = "";
    if (!opening || configuration.holidays.some((r) => r[0] === b.date))
      reason = "closed-day";
    else {
      try {
        if (
          start < localInstant(b.date, opening.open, timezone) ||
          end > localInstant(b.date, opening.close, timezone) ||
          (opening.breaks || []).some(([s, e]) =>
            overlaps(
              { start, end },
              {
                start: localInstant(b.date, s, timezone),
                end: localInstant(b.date, e, timezone),
              },
            ),
          )
        )
          reason = "outside-new-hours-or-break";
      } catch {
        reason = "timezone-conflict";
      }
    }
    if (
      !reason &&
      (Number(b.time.slice(0, 2)) * 60 + Number(b.time.slice(3))) %
        Number(settings.slot_granularity || 30)
    )
      reason = "outside-new-slot-grid";
    if (reason) warnings.push({ reference: b.reference, date: b.date, reason });
  }
  return {
    warnings,
    acknowledgement: digest(JSON.stringify({ configuration, warnings })),
  };
}
