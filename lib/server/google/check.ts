import 'server-only';
import { settings, type Settings } from './settings';
import { readRanges, freeBusy } from './api';
import { collection } from '../db';
import { clinicDefaults, safeError } from '../config';
import { DF } from '../dental/rules';
import { readClinic } from '../dental/clinic';
import { storageProfile } from '../storage/profile';
import { sheetValues, requireHeader, cleanDoctorRows } from '../storage/worksheets';
import schema from '../storage/schema.json';
export async function checkIntegration(signal?: AbortSignal) {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const s = await settings();
  const profile = await storageProfile(s.sheetId);
  const ranges = [
    'Appointments!A1:U1',
    'Services!A1:H2',
    'Hours!A1:G2',
    'Settings!A1:B',
    'Holidays!A1:B1',
    'Doctors!A1:G',
    'FAQ!A1:F1',
  ];
  let configRows: (string | number | boolean)[][];
  let doctorRows: (string | number | boolean)[][];
  if (profile) {
    const tabs = Object.keys(schema) as (keyof typeof schema)[];
    const values = await sheetValues(s.sheetId, ['Appointments!A1:N1', 'Patients!A1:D1', 'Doctors!A1:F1'], signal);
    tabs.forEach((tab, i) => {
      let ok = true;
      try { requireHeader(values[i], schema[tab]); } catch { ok = false; }
      checks.push({ name: tab, ok, detail: 'Clean worksheet schema v2.' });
    });
    const config = await readClinic(signal);
    configRows = config[2];
    doctorRows = await cleanDoctorRows(profile, signal);
    checks.push({ name: 'MongoDB clinic configuration', ok: true, detail: 'Clinic configuration and private doctor connections are stored server-side.' });
  } else {
    const data = await readRanges(ranges, signal);
    const widths = [21, 5, 6, 2, 2, 6, 6];
    ranges.forEach((range, index) => checks.push({
      name: range.split('!')[0], ok: (data[index][0]?.length || 0) >= widths[index],
      detail: `Requires at least ${widths[index]} populated header positions.`,
    }));
    configRows = data[3].slice(1);
    doctorRows = data[5].slice(1);
  }
  const config = DF.settings(configRows), tz = config.timezone || 'Asia/Karachi';
  checks.push({
    name: 'Clinic timezone',
    ok: tz === clinicDefaults().TIMEZONE,
    detail: `Sheet: ${tz}; application: ${clinicDefaults().TIMEZONE}.`,
  });
  const docs = DF.doctors(doctorRows, s.calendarId, clinicDefaults().CLINIC_NAME),
    asked = docs.map((d) => d.calendarId);
  const now = new Date(),
    day = DF.parts(now.toISOString(), tz).date;
  try {
    const busy = await freeBusy(
      {
        timeMin: now.toISOString(),
        timeMax: new Date(now.getTime() + 3600_000).toISOString(),
        items: asked.map((id) => ({ id })),
      },
      signal,
    );
    docs.forEach((d) =>
      checks.push({
        name: `Calendar: ${d.name}`,
        ok: DF.busyFor(busy, d.calendarId, day, tz, asked).ok,
        detail: `${d.implicit ? 'Fallback calendar' : `Doctor ${d.id}, from ${profile ? 'encrypted MongoDB configuration' : 'Doctors column C'}`}: ${d.calendarId}. Checks availability access; confirm event-write access with a test booking.`,
      }),
    );
  } catch (error) {
    checks.push({ name: 'Calendar access', ok: false, detail: safeError(error).code });
  }
  const ready = checks.every((c) => c.ok);
  await (
    await collection<Settings>('app_settings')
  ).updateOne(
    { _id: 'clinic' },
    {
      $set: { ready, checkedAt: new Date() },
      $setOnInsert: { sheetId: s.sheetId, calendarId: s.calendarId, schemaVersion: 1 },
    },
    { upsert: true },
  );
  return { ready, checks };
}
