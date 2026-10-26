import 'server-only';
import { collection } from '../db';
import { env, AppError } from '../config';
export type ScheduleSnapshot = {
  id: string;
  cron: string;
  timezone: string;
  graceSeconds: number;
  enabled: boolean;
  version: string;
};
export type SchedulingPeriod = {
  id: string;
  activatedAt: Date;
  endedAt?: Date;
  plan: 'hobby' | 'pro';
  provider: 'vercel' | 'external' | 'none';
  enabled: boolean;
  version: string;
  schedules?: ScheduleSnapshot[];
};
export type Settings = {
  _id: string;
  sheetId: string;
  calendarId: string;
  schemaVersion: number;
  checkedAt?: Date;
  ready?: boolean;
  schedulingPeriods?: SchedulingPeriod[];
};
export async function settings(): Promise<Settings> {
  return (
    (await (await collection<Settings>('app_settings')).findOne({ _id: 'clinic' })) ?? {
      _id: 'clinic',
      sheetId: env('GOOGLE_SHEETS_ID'),
      calendarId: env('GOOGLE_CALENDAR_ID', 'primary'),
      schemaVersion: 1,
    }
  );
}
export async function saveSettings(input: Record<string, unknown>) {
  const sheetId = String(input.sheetId || '').trim(),
    calendarId = String(input.calendarId || 'primary').trim();
  if (!/^[\w-]{10,200}$/.test(sheetId) || !calendarId || calendarId.length > 254 || /[\r\n]/.test(calendarId))
    throw new AppError('invalid_settings', 400);
  await (
    await collection<Settings>('app_settings')
  ).updateOne(
    { _id: 'clinic' },
    { $set: { sheetId, calendarId, schemaVersion: 1, ready: false } },
    { upsert: true },
  );
  await (await collection('clinic_cache')).deleteMany({});
}
