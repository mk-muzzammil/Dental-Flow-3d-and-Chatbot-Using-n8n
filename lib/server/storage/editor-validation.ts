import { validDuration } from '@/lib/availability';
import { AppError } from "../config";
import type { ClinicConfiguration } from "./profile";
const fail = (code: string): never => {
  throw new AppError(code, 400);
};
export function validateEditorConfiguration(
  c: ClinicConfiguration,
  old: ClinicConfiguration,
) {
  for (const key of ["services", "specializations", "faq"] as const) {
    const records = c[key].filter((r) => !String(r[0]).startsWith("#"));
    const ids = records.map((r) => String(r[0] || ""));
    if (
      ids.some((id) => !/^[\w-]{1,80}$/.test(id)) ||
      new Set(ids).size !== ids.length
    )
      fail("invalid_or_duplicate_record_id");
    if (
      old[key].some(
        (r) => !String(r[0]).startsWith("#") && !ids.includes(String(r[0])),
      )
    )
      fail("deactivate_records_instead_of_deleting");
    if (records.some((r) => !String(r[1] || "").trim()))
      fail("name_or_question_required");
  }
  const interval=Number(c.settings.find(r=>r[0]==='slot_granularity')?.[1]??30);
  if(!Number.isInteger(interval)||interval<1||interval>120)fail('invalid_slot_granularity');
  for (const r of c.services) {
    if(!validDuration(Number(r[2]),interval))fail('service_duration_must_be_multiple_of_interval');
    if (
      !Number.isInteger(Number(r[2])) ||
      Number(r[2]) < 1 ||
      Number(r[2]) > 480 ||
      !Number.isFinite(Number(r[3])) ||
      Number(r[3]) < 0
    )
      fail("invalid_service_price_or_duration");
    if (r[7] && !c.specializations.some((s) => s[0] === r[7]))
      fail("unknown_specialization");
  }
  const seen = new Set<string>();
  for (const r of c.hours) {
    const key = `${r[6] || ""}:${String(r[0]).toLowerCase()}`;
    if (
      ![
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ].includes(String(r[0]).toLowerCase()) ||
      seen.has(key)
    )
      fail("duplicate_or_invalid_schedule_day");
    seen.add(key);
    if (String(r[5]).toUpperCase() === "TRUE") continue;
    if (
      ![r[1], r[2]].every((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) ||
      String(r[1]) >= String(r[2])
    )
      fail("opening_time_must_precede_closing_time");
    if (r[3] || r[4]) {
      if (
        ![r[3], r[4]].every((v) =>
          /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)),
        ) ||
        String(r[3]) < String(r[1]) ||
        String(r[4]) > String(r[2]) ||
        String(r[3]) >= String(r[4])
      )
        fail("break_must_fit_within_working_hours");
    }
  }
  for (const r of c.holidays)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(String(r[0])) ||
      !Number.isFinite(Date.parse(String(r[0])))
    )
      fail("invalid_holiday_date");
  const settings = Object.fromEntries(
    c.settings.map((r) => [String(r[0]), r[1]]),
  );
  for (const [key, min, max] of [
    ["lead_hours", 0, 168],
    ["buffer_min", 0, 240],
    ["slot_granularity", 1, 120],
    ["hold_minutes", 1, 1440],
  ] as const) {
    if (
      settings[key] !== undefined &&
      (!Number.isFinite(Number(settings[key])) ||
        Number(settings[key]) < min ||
        Number(settings[key]) > max)
    )
      fail(`invalid_${key}`);
  }
  if (settings.clinic_map_url) {
    try {
      if (
        !["https:", "http:"].includes(
          new URL(String(settings.clinic_map_url)).protocol,
        )
      )
        fail("invalid_map_url");
    } catch {
      fail("invalid_map_url");
    }
  }
}
