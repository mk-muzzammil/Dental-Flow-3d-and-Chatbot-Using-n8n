import 'server-only';
import metadata from './metadata.json';
import { appointments, type Booking } from '../dental/appointments';
import { expireBooking } from '../dental/actions';
import { collection } from '../db';
import { decrypt } from '../security';
import { type Operation } from '../operations/journal';
import { safeError } from '../config';
export type Counters = { processed: number; succeeded: number; failed: number; skipped: number };
export type JobResult = Counters & { errors: { code: string; item: string }[]; unfinished: boolean };
export async function releaseExpiredHolds(signal: AbortSignal, stopAt: number): Promise<JobResult> {
  const result: JobResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    unfinished: false,
  };
  const candidates = (await appointments(signal))
    .map((x) => x.booking)
    .filter((b) => b.status === 'PENDING' && Date.parse(b.expiresAt) <= Date.now());
  // Resume interrupted operations even if their Sheet status was already written.
  const recover = await (
    await collection<Operation>('operation_journal')
  )
    .find({ type: 'expire', status: { $ne: 'complete' } })
    .limit(1000)
    .toArray();
  for (const op of recover)
    if (op.context) {
      const b = JSON.parse(decrypt(op.context, `context:${op._id}`)) as Booking;
      if (!candidates.some((c) => c.token === b.token && c.eventId === b.eventId)) candidates.push(b);
    }
  for (let index = 0; index < candidates.length; index++) {
    if (Date.now() > stopAt - 15_000 || signal.aborted) {
      result.unfinished = true;
      break;
    }
    result.processed++;
    try {
      const outcome = await expireBooking(candidates[index], signal);
      if (outcome.skipped) result.skipped++;
      else if ('notificationFailed' in outcome && outcome.notificationFailed) {
        result.failed++;
        if (result.errors.length < 20)
          result.errors.push({ code: 'notification_failed', item: `item-${index + 1}` });
      } else result.succeeded++;
    } catch (error) {
      result.failed++;
      if (result.errors.length < 20)
        result.errors.push({ code: safeError(error).code, item: `item-${index + 1}` });
    }
  }
  return result;
}
const handlers: Record<string, typeof releaseExpiredHolds> = { 'release-expired-holds': releaseExpiredHolds };
export const jobs = metadata.map((job) => ({ ...job, handler: handlers[job.id] }));
