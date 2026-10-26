import 'server-only';
import { readRanges, freeBusy } from '../google/api';
import { settings } from '../google/settings';
import { clinicDefaults, checkSignal, AppError } from '../config';
import { collection } from '../db';
import { chooseDoctors } from './chooseDoctors';
import { computeSlots } from './computeSlots';
import { buildClinicInfo, type ClinicInfo } from './clinicInfo';
import { DF } from './rules';
import fallback from '../chat/fallback.json';
import type { SlotConfig, Row } from './types';
export async function readClinic(signal?: AbortSignal) {
  const data = await readRanges(
    ['Services!A2:E', 'Hours!A2:G', 'Settings!A2:B', 'Holidays!A2:B', 'Doctors!A2:F'],
    signal,
  );
  const cfg = DF.settings(data[2]);
  // Invalid setup must not turn a slot loop into an unbounded function.
  if (
    Number(cfg.slot_granularity ?? 15) <= 0 ||
    DF.services(data[0]).some((s) => !Number.isFinite(s.min) || s.min <= 0)
  )
    throw new AppError('invalid_clinic_duration');
  return data;
}
export function busyWindow(date: string, next = false) {
  const base = next ? Date.now() : Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(base)) throw new AppError('bad_date', 400);
  return {
    timeMin: new Date(base - 86400_000).toISOString(),
    timeMax: new Date(base + (next ? 9 : 2) * 86400_000).toISOString(),
  };
}
export async function slots(
  input: { service: string; doctor?: string; date?: string; mode: string; lang?: string },
  signal?: AbortSignal,
) {
  checkSignal(signal);
  const [data, selected] = await Promise.all([readClinic(signal), settings()]);
  const config: SlotConfig = {
    CALENDAR_ID: selected.calendarId,
    CLINIC_NAME: clinicDefaults().CLINIC_NAME,
    service: input.service,
    doctor: input.doctor || 'any',
    date: input.date || '',
    lang: input.lang || 'en',
    listOnly: input.mode === 'doctors',
    next: input.mode === 'next',
    NEXT_DAYS: 7,
  };
  const doctors = chooseDoctors(config, data);
  if (doctors.answerNow) return doctors.response!;
  const busy = await freeBusy(
    { ...busyWindow(config.date, config.next), items: doctors.freeBusyItems },
    signal,
  );
  return computeSlots(config, data, doctors, busy);
}
export async function clinicInfo(view = 'prompt', lang = 'en', signal?: AbortSignal): Promise<ClinicInfo> {
  const data = await readRanges(['Services!A2:G', 'Hours!A2:G', 'Settings!A2:B', 'Doctors!A2:F'], signal);
  const optional = await Promise.allSettled([
    readRanges(['FAQ!A2:F'], signal),
    readRanges(['Specializations!A2:E', 'Doctors!G2:G', 'Services!H2:H'], signal),
  ]);
  const faq =
    optional[0].status === 'fulfilled'
      ? { statusCode: 200, body: { values: optional[0].value[0] } }
      : { statusCode: 404 };
  const spec =
    optional[1].status === 'fulfilled'
      ? { statusCode: 200, body: { valueRanges: optional[1].value.map((values) => ({ values })) } }
      : { statusCode: 404 };
  return buildClinicInfo(
    { ...clinicDefaults(), view, lang },
    { statusCode: 200, body: { valueRanges: data.map((values) => ({ values })) } },
    faq,
    spec,
  );
}
export async function clinicPrompt(signal?: AbortSignal) {
  const cache = await collection<{ _id: string; block: string; fetchedAt: Date }>('clinic_cache');
  const current = await cache.findOne({ _id: 'prompt' });
  if (current && Date.now() - current.fetchedAt.getTime() < 300_000) return current.block;
  try {
    const info = await clinicInfo('prompt', 'en', signal);
    if (info.promptBlock) {
      await cache.updateOne(
        { _id: 'prompt' },
        { $set: { block: info.promptBlock, fetchedAt: new Date() } },
        { upsert: true },
      );
      return info.promptBlock;
    }
  } catch {
    checkSignal(signal);
  }
  if (current?.block) return current.block;
  return fallback
    .replace('{{clinicName}}', clinicDefaults().CLINIC_NAME)
    .replace('{{clinicPhone}}', clinicDefaults().CLINIC_PHONE);
}
