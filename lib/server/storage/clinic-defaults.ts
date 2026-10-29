import "server-only";
import { clinicDefaults } from "../config";
import { settings } from "../google/settings";
import { storageProfile } from "./profile";
export async function savedClinicDefaults() {
  const base = clinicDefaults();
  const profile = await storageProfile((await settings()).sheetId);
  if (!profile) return base;
  const s = Object.fromEntries(
    profile.configuration.settings.map((r) => [String(r[0]), r[1]]),
  );
  return {
    ...base,
    CLINIC_NAME: String(s.clinic_name || base.CLINIC_NAME),
    CLINIC_ADDRESS: String(s.clinic_address || base.CLINIC_ADDRESS),
    CLINIC_PHONE: String(s.clinic_phone || base.CLINIC_PHONE),
    CLINIC_MAP_URL: String(s.clinic_map_url || base.CLINIC_MAP_URL),
    CURRENCY: String(s.currency || base.CURRENCY),
  };
}
