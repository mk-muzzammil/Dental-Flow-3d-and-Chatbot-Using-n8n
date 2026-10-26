import type { Filter } from 'mongodb';
import { adminApi } from '@/lib/server/admin-api';
import { collection } from '@/lib/server/db';
import { AppError } from '@/lib/server/config';
import { reconcileHistory, type Run } from '@/lib/server/jobs/schedule';
export const runtime = 'nodejs';
export function GET(request: Request) {
  return adminApi(request, false, async () => {
    await reconcileHistory();
    const q = new URL(request.url).searchParams,
      filter: Filter<Run> = {};
    if (q.get('job')) filter.jobId = q.get('job')!;
    if (q.get('status')) {
      const status = q.get('status')!;
      if (!['success', 'failed', 'missed', 'running', 'skipped'].includes(status))
        throw new AppError('bad_status', 400);
      filter.status = status as Run['status'];
    }
    if (q.get('source')) {
      const source = q.get('source')!;
      if (!['manual', 'scheduled'].includes(source)) throw new AppError('bad_source', 400);
      filter.triggerSource = source as Run['triggerSource'];
    }
    if (q.get('from') || q.get('to')) {
      const from = new Date(q.get('from') || '2000-01-01'),
        to = new Date(q.get('to') || Date.now());
      if (!Number.isFinite(from.getTime() + to.getTime())) throw new AppError('bad_date', 400);
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('to') || '')) to.setUTCHours(23, 59, 59, 999);
      filter.startedAt = { $gte: from, $lte: to };
    }
    if (q.get('cursor')) {
      try {
        const cursor = JSON.parse(Buffer.from(q.get('cursor')!, 'base64url').toString());
        const date = new Date(cursor.at);
        if (!Number.isFinite(date.getTime()) || typeof cursor.id !== 'string') throw new Error();
        filter.$or = [{ startedAt: { $lt: date } }, { startedAt: date, _id: { $lt: cursor.id } }];
      } catch {
        throw new AppError('bad_cursor', 400);
      }
    }
    const rows = await (await collection<Run>('cron_runs'))
      .find(filter)
      .sort({ startedAt: -1, _id: -1 })
      .limit(26)
      .toArray();
    const more = rows.length > 25,
      list = rows.slice(0, 25),
      last = list.at(-1);
    return {
      runs: list,
      cursor:
        more && last
          ? Buffer.from(JSON.stringify({ at: last.startedAt, id: last._id })).toString('base64url')
          : null,
    };
  });
}
