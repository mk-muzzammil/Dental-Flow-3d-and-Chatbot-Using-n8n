import 'server-only';
import type { Row } from '../google/api';
import { collection } from '../db';
import { AppError } from '../config';
import { encrypt, decrypt, type Ciphertext } from '../security';
export type ClinicConfiguration = {
  services: Row[];
  hours: Row[];
  settings: Row[];
  holidays: Row[];
  faq: Row[];
  specializations: Row[];
};
export type DoctorConnection = { calendarId: string; email: string };
export type StorageProfile = {
  _id: string;
  version: 2;
  state: 'migrating' | 'active';
  configuration: ClinicConfiguration;
  doctorConnections: Ciphertext;
  updatedAt: Date;
  pendingDoctorEdit?: string;
  availabilityVersion?: 2;
};
export async function storageProfile(sheetId: string) {
  const profile = await (await collection<StorageProfile>('clinic_configuration')).findOne({ _id: sheetId });
  if (profile && profile.state !== 'active') throw new AppError('clinic_migration_in_progress', 503);
  return profile;
}
export function doctorConnections(profile: StorageProfile): Record<string, DoctorConnection> {
  return JSON.parse(decrypt(profile.doctorConnections, `doctor-connections:${profile._id}`));
}
export function encryptDoctorConnections(sheetId: string, value: Record<string, DoctorConnection>) {
  return encrypt(JSON.stringify(value), `doctor-connections:${sheetId}`);
}
export function validateConfiguration(value: unknown): ClinicConfiguration {
  if (!value || typeof value !== 'object') throw new AppError('invalid_clinic_configuration', 400);
  const config = value as ClinicConfiguration;
  for (const [key, width] of Object.entries({ services: 11, hours: 7, settings: 2, holidays: 2, faq: 7, specializations: 5 })) {
    const rows = config[key as keyof ClinicConfiguration];
    if (!Array.isArray(rows) || rows.length > 1000 || rows.some(row => !Array.isArray(row) || row.length > width || row.some(cell => !['string', 'number', 'boolean'].includes(typeof cell) || String(cell).length > 10000)))
      throw new AppError('invalid_clinic_configuration', 400);
  }
  if (!config.services.length || !config.hours.length || config.services.some(r => !r[0] || !Number.isFinite(Number(r[2])) || Number(r[2]) <= 0))
    throw new AppError('invalid_clinic_configuration', 400);
  const settings = Object.fromEntries(config.settings.map(r => [String(r[0]), r[1]]));
  if (Number(settings.slot_granularity ?? 30) <= 0 || !Number.isFinite(Number(settings.slot_granularity ?? 30))) throw new AppError('invalid_clinic_configuration', 400);
  try { new Intl.DateTimeFormat('en', { timeZone: String(settings.timezone || 'Asia/Karachi') }); }
  catch { throw new AppError('invalid_clinic_timezone', 400); }
  return config;
}
