import "server-only";
import { cache } from "react";
import { digest } from "../security";
import * as demo from "@/content/clinic";
import type { PublicClinic } from "@/lib/public-clinic";
import { appMode, clinicDefaults, AppError } from "../config";
import { settings } from "../google/settings";
import { storageProfile } from "./profile";
import { sheetValues, requireHeader } from "./worksheets";
import schema from "./schema.json";
import { openingForWeekday } from "../dental/availability";
import { clock, weekdayLabel } from "@/lib/slots";
const text = (v: unknown) => String(v ?? "");
const localized = (en: unknown, ar?: unknown, ur?: unknown) => ({
  en: text(en),
  ar: text(ar || en),
  ur: text(ur || en),
});
const active = (v: unknown) => text(v).toUpperCase() !== "FALSE";
export const publicClinic = cache(async (): Promise<PublicClinic> => {
  if (appMode() === "demo")
    return {
      clinic: demo.clinic,
      services: demo.services,
      dentists: demo.dentists,
      faq: demo.faq,
    };
  const selected = await settings(),
    profile = await storageProfile(selected.sheetId);
  if (!profile) throw new AppError("clinic_not_migrated");
  const c = profile.configuration,
    s = Object.fromEntries(c.settings.map((r) => [String(r[0]), r[1]])),
    defaults = clinicDefaults();
  const [rows] = await sheetValues(selected.sheetId, ["Doctors!A:F"]);
  requireHeader(rows, schema.Doctors);
  const hours = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  return {
    scheduleVersion: digest(JSON.stringify([c.services,c.hours,c.settings,c.holidays])),
    clinic: {
      timezone: text(s.timezone || defaults.TIMEZONE),
      name: localized(
        s.clinic_name || defaults.CLINIC_NAME,
        s.clinic_name_ar,
        s.clinic_name_ur,
      ),
      city: localized(s.clinic_city || "", s.clinic_city_ar, s.clinic_city_ur),
      phone: text(s.clinic_phone || defaults.CLINIC_PHONE),
      email: text(s.clinic_email || ""),
      address: localized(
        s.clinic_address || defaults.CLINIC_ADDRESS,
        s.clinic_address_ar,
        s.clinic_address_ur,
      ),
      mapUrl: text(s.clinic_map_url || defaults.CLINIC_MAP_URL),
      currency: text(s.currency || defaults.CURRENCY),
      hours: hours.map(day => {
        const opening = openingForWeekday(c.hours, '', day);
        return {day: localized(day, undefined, weekdayLabel('ur',day)),
          time: opening ? `${clock('en',opening.open)} – ${clock('en',opening.close)}${(opening.breaks || []).length ? ' (break '+[...new Set((opening.breaks || []).map(([from,to])=>`${clock('en',from)}–${clock('en',to)}`))].join(', ')+')' : ''}` : ''};
      }),
    },
    services: c.services
      .filter((r) => active(r[4]))
      .map((r) => ({
        id: text(r[0]),
        name: localized(r[1], r[5], r[6] || demo.services.find(s => s.name.en === text(r[1]))?.name.ur),
        minutes: Number(r[2]),
        price: Number(r[3]),
        blurb: localized(r[8] || "", r[9], r[10] || demo.services.find(s => s.blurb.en === text(r[8]))?.blurb.ur),
      })),
    dentists: rows
      .slice(1)
      .filter((r) => r[0] && active(r[3]))
      .map((r) => {
        const specs = c.specializations.filter((sp) =>
          text(r[4]).split(",").includes(text(sp[0])),
        );
        const weeklyHours = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].flatMap(day => {
          const opening = openingForWeekday(c.hours, text(r[0]), day);
          return opening ? [{day, ...opening}] : [];
        });
        const work = weeklyHours.map(h => h.day).join(', ');
        return {
          id: text(r[0]),
          name: text(r[1]),
          specialty: localized(
            specs.map((sp) => sp[1]).join(", "),
            specs.map((sp) => sp[2] || sp[1]).join(", "),
            specs.map((sp) => sp[3] || sp[1]).join(", "),
          ),
          days: localized(work, undefined, weeklyHours.map(h => weekdayLabel("ur",h.day)).join("، ")),
          weeklyHours,
          initials: text(r[1])
            .replace(/^Dr\.?\s*/i, "")
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0])
            .join(""),
        };
      }),
    faq: c.faq
      .filter((r) => r[0] && !text(r[0]).startsWith("#") && active(r[5]))
      .map((r) => ({ q: localized(r[1], undefined, r[6] || demo.faq.find(f => f.q.en === text(r[1]))?.q.ur), a: localized(r[2], r[3], r[4]) })),
  };
});
