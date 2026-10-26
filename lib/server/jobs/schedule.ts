import 'server-only';
import { randomUUID } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import { digest } from '../security';
import { collection, retentionDate } from '../db';
import { planTier, AppError } from '../config';
import { settings, type Settings, type SchedulingPeriod, type ScheduleSnapshot } from '../google/settings';
import { withLease } from '../operations/lease';
import { jobs } from './registry';
export type RunStatus = 'running' | 'success' | 'failed' | 'missed' | 'skipped';
export type Run = {
  _id: string;
  jobId: string;
  dedupeKey: string;
  scheduledAt?: Date;
  startedAt: Date;
  endedAt?: Date;
  deadlineAt: Date;
  status: RunStatus;
  triggerSource: 'manual' | 'scheduled';
  provider: 'vercel' | 'admin' | 'cli' | 'external';
  periodId?: string;
  durationMs?: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: { code: string; item?: string }[];
  configVersion: string;
  deployment: string;
  expiresAt: Date;
};
type ConfiguredSettings = Settings & {
  scheduler?: 'vercel' | 'external' | 'none';
  schedulerPlan?: 'hobby' | 'pro';
};
const snapshot = (): ScheduleSnapshot[] =>
  jobs.map((job) => ({
    id: job.id,
    cron: job.cron,
    timezone: job.timezone,
    graceSeconds: job.graceSeconds ?? 120,
    enabled: job.enabled,
    version: job.version,
  }));
export async function schedulingPeriod() {
  const schedules = snapshot(),
    version = digest(JSON.stringify(schedules)).slice(0, 16);
  const current = (await settings()) as ConfiguredSettings,
    plan = planTier();
  const provider =
    current.schedulerPlan === plan && current.scheduler
      ? current.scheduler
      : plan === 'pro'
        ? 'vercel'
        : 'none';
  const enabled = provider !== 'none';
  const last = current.schedulingPeriods?.at(-1);
  if (last && !last.endedAt && last.plan === plan && last.provider === provider && last.version === version)
    return last;
  return withLease('schedule-period', async () => {
    const all = await collection<ConfiguredSettings>('app_settings'),
      cfg = (await settings()) as ConfiguredSettings,
      periods = cfg.schedulingPeriods || [],
      previous = periods.at(-1);
    if (
      previous &&
      !previous.endedAt &&
      previous.plan === plan &&
      previous.provider === provider &&
      previous.version === version
    )
      return previous;
    const now = new Date();
    if (previous && !previous.endedAt) previous.endedAt = now;
    const period: SchedulingPeriod = {
      id: randomUUID(),
      activatedAt: now,
      plan,
      provider,
      enabled,
      version,
      schedules,
    };
    periods.push(period);
    await all.updateOne(
      { _id: 'clinic' },
      {
        $set: { schedulingPeriods: periods },
        $setOnInsert: { sheetId: cfg.sheetId, calendarId: cfg.calendarId, schemaVersion: 1 },
      },
      { upsert: true },
    );
    return period;
  });
}
export async function configureScheduler(provider: string) {
  if (!['none', 'vercel', 'external'].includes(provider) || (provider === 'vercel' && planTier() !== 'pro'))
    throw new AppError('invalid_scheduler', 400);
  await (
    await collection<ConfiguredSettings>('app_settings')
  ).updateOne(
    { _id: 'clinic' },
    { $set: { scheduler: provider as ConfiguredSettings['scheduler'], schedulerPlan: planTier() } },
    { upsert: true },
  );
  return schedulingPeriod();
}
export function expectedOccurrences(period: SchedulingPeriod, now = new Date(), jobId = jobs[0].id) {
  if (!period.enabled) return [];
  const schedule = (period.schedules ?? snapshot()).find((job) => job.id === jobId);
  if (!schedule?.enabled) return [];
  const start = Math.max(period.activatedAt.getTime(), now.getTime() - 30 * 86400_000);
  const end = Math.min(period.endedAt?.getTime() ?? Infinity, now.getTime());
  if (start >= end) return [];
  const interval = CronExpressionParser.parse(schedule.cron, {
    tz: schedule.timezone,
    currentDate: new Date(start - 1),
    endDate: new Date(end),
  });
  const result: Date[] = [];
  while (interval.hasNext()) {
    const at = interval.next().toDate();
    if (at.getTime() >= end) break;
    const graceEnd =
      period.plan === 'hobby' && period.provider === 'vercel'
        ? Math.floor(at.getTime() / 3600_000) * 3600_000 + 3600_000 + schedule.graceSeconds * 1000
        : at.getTime() + schedule.graceSeconds * 1000;
    if (now.getTime() > graceEnd) result.push(at);
  }
  return result;
}
export function occurrenceTime(now = new Date(), jobId = jobs[0].id) {
  const job = jobs.find((job) => job.id === jobId);
  if (!job) throw new AppError('job_not_found', 404);
  return CronExpressionParser.parse(job.cron, { tz: job.timezone, currentDate: new Date(now.getTime() + 1) })
    .prev()
    .toDate();
}
export function nextOccurrence(jobId: string, now = new Date()) {
  const job = jobs.find((job) => job.id === jobId);
  if (!job) throw new AppError('job_not_found', 404);
  return CronExpressionParser.parse(job.cron, { tz: job.timezone, currentDate: now }).next().toDate();
}
export const scheduledKey = (jobId: string, periodId: string, at: Date) =>
  `${jobId}:${periodId}:${at.toISOString()}`;
export async function reconcileHistory() {
  await schedulingPeriod();
  const runs = await collection<Run>('cron_runs'),
    now = new Date();
  await runs.updateMany(
    { status: 'running', deadlineAt: { $lt: now } },
    { $set: { status: 'failed', endedAt: now, errors: [{ code: 'interrupted' }] } },
  );
  const periods = (await settings()).schedulingPeriods || [];
  for (const period of periods)
    for (const job of period.schedules ?? snapshot()) {
      const expected = expectedOccurrences(period, now, job.id);
      if (!expected.length) continue;
      const existing = await runs
        .find(
          { jobId: job.id, periodId: period.id, triggerSource: 'scheduled' },
          { projection: { scheduledAt: 1 } },
        )
        .toArray();
      const seen = new Set(existing.map((r) => r.scheduledAt?.getTime()));
      const missing = expected.filter((d) => !seen.has(d.getTime()));
      if (missing.length)
        await runs.bulkWrite(
          missing.map((at) => ({
            updateOne: {
              filter: { dedupeKey: scheduledKey(job.id, period.id, at) },
              update: {
                $setOnInsert: {
                  _id: randomUUID(),
                  jobId: job.id,
                  dedupeKey: scheduledKey(job.id, period.id, at),
                  scheduledAt: at,
                  startedAt: at,
                  endedAt: at,
                  deadlineAt: at,
                  status: 'missed',
                  triggerSource: 'scheduled',
                  provider: period.provider === 'external' ? 'external' : 'vercel',
                  periodId: period.id,
                  processed: 0,
                  succeeded: 0,
                  failed: 0,
                  skipped: 0,
                  errors: [],
                  configVersion: period.version,
                  deployment: '',
                  expiresAt: retentionDate(),
                },
              },
              upsert: true,
            },
          })),
          { ordered: false },
        );
    }
}
