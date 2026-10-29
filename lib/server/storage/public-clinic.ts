import "server-only";
import { cache } from "react";
import * as demo from "@/content/clinic";
import type { PublicClinic } from "@/lib/public-clinic";
import { appMode, clinicDefaults, AppError } from "../config";
import { settings } from "../google/settings";
import { storageProfile } from "./profile";
import { sheetValues, requireHeader } from "./worksheets";
import schema from "./schema.json";
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
  const hours = c.hours.filter((r) => !r[6]);
  return {
    clinic: {
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
      hours: hours.map((r) => ({
        day: localized(r[0]),
        time:
          text(r[5]).toUpperCase() === "TRUE"
            ? ""
            : `${r[1]} – ${r[2]}${r[3] && r[4] ? ` (break ${r[3]}–${r[4]})` : ""}`,
      })),
    },
    services: c.services
      .filter((r) => active(r[4]))
      .map((r) => ({
        id: text(r[0]),
        name: localized(r[1], r[5], r[6]),
        minutes: Number(r[2]),
        price: Number(r[3]),
        blurb: localized(r[8] || "", r[9], r[10]),
      })),
    dentists: rows
      .slice(1)
      .filter((r) => r[0] && active(r[3]))
      .map((r) => {
        const specs = c.specializations.filter((sp) =>
          text(r[4]).split(",").includes(text(sp[0])),
        );
        const custom = c.hours.filter((h) => h[6] === r[0]);
        const work = (custom.length ? custom : hours)
          .filter((h) => text(h[5]).toUpperCase() !== "TRUE")
          .map((h) => text(h[0]).toUpperCase())
          .join(", ");
        return {
          id: text(r[0]),
          name: text(r[1]),
          specialty: localized(
            specs.map((sp) => sp[1]).join(", "),
            specs.map((sp) => sp[2] || sp[1]).join(", "),
            specs.map((sp) => sp[3] || sp[1]).join(", "),
          ),
          days: localized(work),
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
      .map((r) => ({ q: localized(r[1]), a: localized(r[2], r[3], r[4]) })),
  };
});
