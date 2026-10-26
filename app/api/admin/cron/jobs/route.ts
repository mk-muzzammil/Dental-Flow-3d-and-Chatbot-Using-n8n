import { adminApi } from '@/lib/server/admin-api';
export const runtime = 'nodejs';
import { collection } from '@/lib/server/db';
import { jobs } from '@/lib/server/jobs/registry';
import { reconcileHistory, schedulingPeriod, nextOccurrence, type Run } from '@/lib/server/jobs/schedule';
export function GET(request: Request) {
  return adminApi(request, false, async () => {
    await reconcileHistory();
    const period = await schedulingPeriod(),
      runs = await collection<Run>('cron_runs');
    return {
      jobs: await Promise.all(
        jobs.map(async ({ handler, ...job }) => ({
          ...job,
          plan: period.plan,
          nativeSchedulable: job.nativePlans.includes(period.plan),
          mode: period.enabled ? (period.provider === 'vercel' ? 'native' : 'external') : 'manual-only',
          period,
          lastRun: await runs.findOne(
            { jobId: job.id, status: { $ne: 'missed' } },
            { sort: { startedAt: -1 } },
          ),
          lastSuccess: await runs.findOne({ jobId: job.id, status: 'success' }, { sort: { startedAt: -1 } }),
          nextExpected: period.enabled ? nextOccurrence(job.id) : null,
        })),
      ),
    };
  });
}
