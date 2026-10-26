import 'server-only';
import { randomUUID } from 'node:crypto';
import { appMode, AppError, deadline, env, safeError } from '../config';
import { collection, initializeDatabase, retentionDate } from '../db';
import { withLease } from '../operations/lease';
import { jobs } from './registry';
import { schedulingPeriod, occurrenceTime, scheduledKey, type Run } from './schedule';
export async function runJob(
  jobId: string,
  trigger: { source: 'scheduled' | 'manual'; provider: Run['provider']; key: string },
  parent?: AbortSignal,
) {
  if (appMode() !== 'live') throw new AppError('live_mode_required', 400);
  await initializeDatabase();
  const job = jobs.find((j) => j.id === jobId);
  if (!job || !job.enabled) throw new AppError('job_not_found', 404);
  const period = await schedulingPeriod(),
    scheduledAt = trigger.source === 'scheduled' ? occurrenceTime(new Date(), jobId) : undefined;
  if (scheduledAt && (!period.enabled || period.provider !== trigger.provider))
    throw new AppError('scheduler_not_enabled', 409);
  const dedupeKey = scheduledAt
    ? scheduledKey(jobId, period.id, scheduledAt)
    : `${jobId}:manual:${trigger.key}`;
  const runs = await collection<Run>('cron_runs'),
    prior = await runs.findOne({ dedupeKey });
  if (prior && prior.status !== 'missed') return { ...prior, duplicate: true };
  const startedAt = new Date(),
    stopAt = Date.now() + job.budgetSeconds * 1000;
  const run: Run = {
    _id: prior?._id || randomUUID(),
    jobId,
    dedupeKey,
    ...(scheduledAt ? { scheduledAt, periodId: period.id } : {}),
    startedAt,
    deadlineAt: new Date(stopAt + 30_000),
    status: 'running',
    triggerSource: trigger.source,
    provider: trigger.provider,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    configVersion: job.version,
    deployment: env('VERCEL_GIT_COMMIT_SHA', 'local'),
    expiresAt: retentionDate(),
  };
  if (prior) {
    const updated = await runs.updateOne({ _id: prior._id, status: 'missed' }, { $set: run });
    if (!updated.modifiedCount) return { ...(await runs.findOne({ dedupeKey })), duplicate: true };
  } else {
    try {
      await runs.insertOne(run);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
        return { ...(await runs.findOne({ dedupeKey })), duplicate: true };
      throw error;
    }
  }
  if (scheduledAt)
    await (
      await collection('cron_slots')
    ).updateOne(
      { jobId, periodId: period.id, scheduledAt },
      { $set: { runId: run._id, expiresAt: retentionDate() } },
      { upsert: true },
    );
  const signal = deadline(job.budgetSeconds * 1000, parent);
  try {
    const result = await withLease(`job:${jobId}`, () => job.handler(signal, stopAt), {
      signal,
      seconds: job.budgetSeconds + 30,
    });
    Object.assign(run, result, { status: result.failed || result.unfinished ? 'failed' : 'success' });
    if (result.unfinished) run.errors.push({ code: 'deadline_partial' });
  } catch (error) {
    const e = safeError(error);
    run.status = e.code === 'already_running' ? 'skipped' : 'failed';
    run.errors = [{ code: e.code }];
  }
  run.endedAt = new Date();
  run.durationMs = run.endedAt.getTime() - startedAt.getTime();
  await runs.updateOne({ _id: run._id }, { $set: run });
  return run;
}
